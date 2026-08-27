import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ["../../apps/web/.env.local", "../../apps/web/.env"] });

const rawUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const migrationUrl = (() => {
  if (!rawUrl) return undefined;
  const parsed = new URL(rawUrl);
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (!local && !parsed.searchParams.has("sslmode")) {
    parsed.searchParams.set("sslmode", "verify-full");
  }
  return parsed.toString();
})();

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
  casing: "snake_case",
  schemaFilter: "public",
  introspect: { casing: "camel" },
  migrations: { table: "__drizzle_migrations", schema: "drizzle" },
  breakpoints: true,
  strict: true,
  verbose: true,
});
