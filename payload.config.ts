import path from "path";
import { fileURLToPath } from "url";

import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import { vercelPostgresAdapter } from "@payloadcms/db-vercel-postgres";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import sharp from "sharp";

import { Users } from "./src/payload/collections/Users.ts";
import { Posts } from "./src/payload/collections/Posts.ts";
import { Media } from "./src/payload/collections/Media.ts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

function shouldUsePostgres(): boolean {
  if (process.env.VERCEL === "1") return true;

  const postgresURL = process.env.POSTGRES_URL;
  if (postgresURL && postgresURL.length > 0) return true;

  const databaseURL = process.env.DATABASE_URL;
  if (!databaseURL) return false;
  return (
    databaseURL.startsWith("postgres://") ||
    databaseURL.startsWith("postgresql://")
  );
}

function getPayloadSecret(): string {
  const secret = process.env.PAYLOAD_SECRET;
  if (secret && secret.length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAYLOAD_SECRET is required in production");
  }
  return "dev-payload-secret-change-me";
}

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: "- bokxcms",
    },
    autoLogin:
      process.env.NODE_ENV === "development"
        ? {
            email: "admin@example.com",
            password: "test",
            prefillOnly: true,
          }
        : false,
  },
  collections: [Users, Media, Posts],
  secret: getPayloadSecret(),
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "src/payload/payload-types.ts"),
  },
  db: shouldUsePostgres()
    ? vercelPostgresAdapter({
        connectionString: (() => {
          const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
          if (url && url.length > 0) return url;
          throw new Error(
            "Missing Postgres connection string. Set DATABASE_URL or POSTGRES_URL in Vercel."
          );
        })(),
      })
    : sqliteAdapter({
        client: {
          url: process.env.DATABASE_URL || "file:./payload.db",
        },
      }),
  plugins: shouldUsePostgres()
    ? [
        vercelBlobStorage({
          collections: {
            media: true,
          },
          token: process.env.BLOB_READ_WRITE_TOKEN,
        }),
      ]
    : [],
});

