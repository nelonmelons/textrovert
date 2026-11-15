import { createClient, type Client } from "@libsql/client/web";

export function turso(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is not set on this Convex deployment. Run: npx convex env set TURSO_DATABASE_URL libsql://...");
  return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
}
