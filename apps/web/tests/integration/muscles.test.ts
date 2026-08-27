import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@setwise/db/schema";
import { MUSCLES } from "@setwise/domain/muscles";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();

afterAll(async () => {
  await client.end();
});

type Row = { slug: string; displayName: string; svgPathId: string; bodySide: string };

/**
 * Pulls the tuples back out of the migration's VALUES list. Parsing the SQL
 * rather than trusting a comment is the point: the migration is a hand-written
 * copy of `MUSCLES`, and a copy nobody checks is a copy that drifts.
 */
async function migrationRows(): Promise<Row[]> {
  const file = path.join(process.cwd(), "../../packages/db/drizzle", "0002_seed_muscles.sql");
  const sql = await readFile(file, "utf8");

  return [...sql.matchAll(/\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\s*\)/g)].map(
    ([, slug, displayName, svgPathId, bodySide]) => ({
      slug,
      displayName,
      svgPathId,
      bodySide,
    }),
  );
}

const canonical: Row[] = MUSCLES.map((muscle) => ({
  slug: muscle.slug,
  displayName: muscle.displayName,
  svgPathId: muscle.svgPathId,
  bodySide: muscle.bodySide,
}));

describe("muscle reference data", () => {
  it("ships the canonical list in the migration", async () => {
    expect(await migrationRows()).toEqual(canonical);
  });

  it("matches the canonical list in the database", async () => {
    const rows = await db
      .select({
        slug: schema.muscles.slug,
        displayName: schema.muscles.displayName,
        svgPathId: schema.muscles.svgPathId,
        bodySide: schema.muscles.bodySide,
      })
      .from(schema.muscles);

    const bySlug = new Map(rows.map((row) => [row.slug, row]));

    // Migrating is enough: this passes on a database that has never been
    // seeded, which is the whole reason the rows moved into a migration.
    for (const muscle of canonical) {
      expect(bySlug.get(muscle.slug)).toEqual(muscle);
    }
  });
});
