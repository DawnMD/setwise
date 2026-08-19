/**
 * Neon hands you a libpq-style URL with `sslmode` and `channel_binding` in the
 * query string. postgres.js forwards unrecognised query params to the server as
 * startup parameters, which Postgres rejects. Strip them and express the intent
 * through the driver's own options instead.
 */
export function parseConnectionString(url: string): {
  url: string;
  ssl: "require" | false;
} {
  const parsed = new URL(url);
  const sslmode = parsed.searchParams.get("sslmode");

  for (const key of ["sslmode", "channel_binding"]) {
    parsed.searchParams.delete(key);
  }

  return {
    url: parsed.toString(),
    ssl: sslmode === "disable" ? false : "require",
  };
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
