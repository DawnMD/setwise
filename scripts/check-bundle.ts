import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Build budgets, enforced rather than remembered.
 *
 * A bundle does not regress in one commit that anyone would notice. It regresses
 * a kilobyte at a time, in changes that each look free, until a screen takes
 * four seconds on the gym wifi it was designed for. Failing the build is the
 * only version of this check that works.
 *
 * Sizes are gzip, because that is what is sent. Brotli would be smaller and is
 * what Vercel actually serves, so every number here is a slight overstatement —
 * in the right direction for a ceiling.
 */

const ASSETS = ".output/public/assets";

type Budget = {
  name: string;
  /** Matches the base name of a built chunk. */
  match: (file: string) => boolean;
  /** Bytes, gzipped. */
  limit: number;
  why: string;
};

const KB = 1024;

const BUDGETS: Budget[] = [
  {
    name: "entry chunk",
    // One entry, whatever its hash. Everything else is fetched on demand.
    match: (file) => /^index-[\w-]+\.js$/.test(file),
    limit: 110 * KB,
    why: "the first script every visitor downloads, before anything is on screen",
  },
  {
    name: "route chunk",
    // No single screen should be heavier than the shell that loads it.
    match: (file) =>
      /^(train|progress|body|plan|onboarding|settings|_sessionId|_routineId)-[\w-]+\.js$/.test(
        file,
      ),
    limit: 32 * KB,
    why: "one screen's own code, fetched when it is navigated to",
  },
];

/**
 * Packages that must not reach the browser at all.
 *
 * Recharts was replaced by `components/ui/mini-chart`. It is still resolvable
 * from `node_modules` for as long as something else depends on it, so the check
 * is that nothing imported it, not that it is uninstalled.
 */
const FORBIDDEN = [{ marker: "recharts", why: "replaced by the SVG chart in components/ui" }];

function gzipSize(path: string): number {
  return gzipSync(readFileSync(path), { level: 9 }).length;
}

const format = (bytes: number) => `${(bytes / KB).toFixed(1)} KB`;

function main() {
  let assets: string[];
  try {
    assets = readdirSync(ASSETS).filter((file) => file.endsWith(".js"));
  } catch {
    console.error(`No build to check. Run 'pnpm build' first (looked in ${ASSETS}).`);
    process.exit(1);
  }

  const failures: string[] = [];

  for (const budget of BUDGETS) {
    const matched = assets.filter((file) => budget.match(file));

    if (matched.length === 0) {
      failures.push(`No chunk matched the ${budget.name} budget. The build output has changed.`);
      continue;
    }

    for (const file of matched) {
      const size = gzipSize(join(ASSETS, file));
      const verdict = size > budget.limit ? "OVER" : "ok";
      console.info(
        `${verdict.padEnd(4)} ${budget.name.padEnd(12)} ${format(size).padStart(9)} / ${format(budget.limit)}  ${file}`,
      );
      if (size > budget.limit) {
        failures.push(
          `${file} is ${format(size)} gzip, over the ${format(budget.limit)} ${budget.name} budget — ${budget.why}.`,
        );
      }
    }
  }

  for (const { marker, why } of FORBIDDEN) {
    const found = assets.filter((file) => {
      const path = join(ASSETS, file);
      return statSync(path).isFile() && readFileSync(path, "utf8").includes(marker);
    });

    if (found.length > 0) {
      failures.push(`${marker} reached the browser in ${found.join(", ")} — ${why}.`);
    } else {
      console.info(`ok   no ${marker} in the client bundle`);
    }
  }

  const total = assets.reduce((sum, file) => sum + gzipSize(join(ASSETS, file)), 0);
  console.info(`\n${assets.length} client chunks, ${format(total)} gzip in total.`);

  if (failures.length > 0) {
    console.error(`\nBundle budget failed:\n${failures.map((line) => `  - ${line}`).join("\n")}`);
    process.exit(1);
  }
}

main();
