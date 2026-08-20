import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

// Neon recommends a direct connection for ORM migration tools.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(url ? { dbCredentials: { url } } : {}),
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
