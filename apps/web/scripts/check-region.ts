import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

/**
 * Refuses a production deploy whose database is not in the region the functions
 * were pinned to.
 *
 * Functions run in `sin1` because the users are in Asia. That is only worth
 * anything if Postgres is next door: a Singapore function talking to a Virginia
 * database is slower than a Virginia function would have been, and the failure
 * is silent — everything works, everything is 200 ms worse, and nothing in the
 * build says so.
 *
 * Neon puts its region in the host name, which is the only signal available at
 * build time without an API token.
 */
const EXPECTED_REGION = "ap-southeast-1";

const url = process.env.DATABASE_URL;
const environment = process.env.VERCEL_ENV ?? "development";

function fail(message: string): never {
  console.error(`Region check failed: ${message}`);
  process.exit(1);
}

if (!url) {
  // Local checkouts without an env file are not deploying anything.
  console.info("Region check skipped: DATABASE_URL is not set.");
  process.exit(0);
}

const host = new URL(url).hostname;
const local = host === "localhost" || host === "127.0.0.1" || host === "::1";

if (local || !host.endsWith(".neon.tech")) {
  console.info(`Region check skipped: ${host} is not a Neon endpoint.`);
  process.exit(0);
}

const matches = host.includes(EXPECTED_REGION);

if (matches) {
  console.info(`Region check passed: Neon endpoint is in ${EXPECTED_REGION}.`);
  process.exit(0);
}

if (environment === "production") {
  fail(`functions are pinned to sin1 but ${host} is not in ${EXPECTED_REGION}.`);
}

// A preview branch may legitimately point somewhere else. Say so and carry on;
// only production has a promise to keep here.
console.warn(`Region check warning: ${host} is not in ${EXPECTED_REGION} (${environment}).`);
