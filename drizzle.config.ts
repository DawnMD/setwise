import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: [".env.local", ".env"] });

// Neon recommends a direct connection for ORM migration tools.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const host = url ? new URL(url).hostname : undefined;
const localDatabase = host === "localhost" || host === "127.0.0.1" || host === "::1";
const migrationUrl = (() => {
  if (!url || localDatabase) return url;
  const parsed = new URL(url);
  if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "verify-full");
  return parsed.toString();
})();

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
  casing: "snake_case",
  schemaFilter: "public",
  introspect: { casing: "camel" },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
  breakpoints: true,
  strict: true,
  verbose: true,
});
