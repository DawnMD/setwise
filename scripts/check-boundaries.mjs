#!/usr/bin/env node
/**
 * Fails when a workspace's package.json declares a dependency the architecture
 * does not allow, or when a workspace has no explicit TypeScript or ESLint
 * configuration.
 *
 * ESLint enforces the same graph against import statements. This script
 * enforces it one level up, against what each package is even allowed to
 * resolve, so an unused-but-declared dependency cannot quietly pre-authorise a
 * violation that only appears later.
 *
 * The matrix lives in @setwise/eslint-config/boundaries and is imported here by
 * path: this is repository tooling reaching into a repository file, not a
 * workspace dependency of the orchestration root.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ALLOWED_INTERNAL_DEPENDENCIES,
  APPLICATIONS,
  CONFIG_ONLY_WORKSPACES,
  CONFIG_PACKAGES,
} from "../packages/eslint-config/boundaries.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const ESLINT_CONFIGS = ["eslint.config.js", "eslint.config.mjs", "eslint.config.ts"];

/** The `packages:` globs from pnpm-workspace.yaml, which are all `<dir>/*`. */
function workspaceGlobs() {
  const lines = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8").split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "packages:");
  const globs = [];

  for (const line of lines.slice(start + 1)) {
    const match = /^\s+-\s+["']?(.+?)["']?\s*$/.exec(line);
    if (!match) break;
    globs.push(match[1]);
  }

  return globs;
}

function workspaces() {
  const found = [];

  for (const glob of workspaceGlobs()) {
    const parent = join(root, glob.replace(/\/\*$/, ""));
    if (!existsSync(parent)) continue;

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const dir = join(parent, entry.name);
      const manifest = join(dir, "package.json");
      if (!existsSync(manifest)) continue;

      found.push({
        dir,
        relative: `${glob.replace(/\/\*$/, "")}/${entry.name}`,
        manifest: JSON.parse(readFileSync(manifest, "utf8")),
      });
    }
  }

  return found.sort((a, b) => (a.relative < b.relative ? -1 : 1));
}

const problems = [];
const found = workspaces();

for (const { dir, relative, manifest } of found) {
  const name = manifest.name;
  const fail = (message) => problems.push(`${relative} (${name ?? "unnamed"}): ${message}`);

  if (!name) {
    fail("package.json has no name.");
    continue;
  }

  const allowed = ALLOWED_INTERNAL_DEPENDENCIES[name];

  if (!allowed) {
    fail(
      "is not in the dependency matrix. Add it to ALLOWED_INTERNAL_DEPENDENCIES in packages/eslint-config/boundaries.js.",
    );
    continue;
  }

  for (const field of DEPENDENCY_FIELDS) {
    for (const [dependency, range] of Object.entries(manifest[field] ?? {})) {
      if (!dependency.startsWith("@setwise/")) continue;

      if (!range.startsWith("workspace:")) {
        fail(`${field}.${dependency} is "${range}"; internal dependencies must use "workspace:*".`);
      }

      if (CONFIG_PACKAGES.includes(dependency)) {
        if (field === "dependencies") {
          fail(`${dependency} is configuration and belongs in devDependencies.`);
        }
        continue;
      }

      if (APPLICATIONS.includes(dependency)) {
        fail(
          `depends on the application ${dependency}. Applications are composition roots — nothing may depend on them.`,
        );
        continue;
      }

      if (!allowed.includes(dependency)) {
        fail(
          `depends on ${dependency}, which is outside its layer. ${name} may depend on ${allowed.length > 0 ? allowed.join(", ") : "no other workspace"}.`,
        );
      }
    }
  }

  if (CONFIG_ONLY_WORKSPACES.includes(name)) continue;

  const tsconfigPath = join(dir, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    fail("has no tsconfig.json.");
  } else {
    const extended = JSON.parse(readFileSync(tsconfigPath, "utf8")).extends;
    const extendsShared = [extended]
      .flat()
      .some(
        (entry) => typeof entry === "string" && entry.startsWith("@setwise/typescript-config/"),
      );

    if (!extendsShared) {
      fail("tsconfig.json does not extend a @setwise/typescript-config preset.");
    }
  }

  if (!ESLINT_CONFIGS.some((file) => existsSync(join(dir, file)))) {
    fail(`has no flat ESLint config (${ESLINT_CONFIGS.join(", ")}).`);
  }
}

if (problems.length > 0) {
  console.error("Dependency boundary violations:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`Dependency boundaries: ${found.length} workspaces checked, no violations.`);
