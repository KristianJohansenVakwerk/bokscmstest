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
  // Vercel "preview" and "production" builds run with NODE_ENV=production.
  // Only hard-require PAYLOAD_SECRET at runtime when actually deployed on Vercel.
  if (process.env.NODE_ENV === "production" && process.env.VERCEL === "1") {
    throw new Error("PAYLOAD_SECRET is required in production");
  }
  return "dev-payload-secret-change-me";
}

function getPostgresConnectionString(): string {
  const url =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    // Neon/Vercel Postgres integrations frequently prefix vars
    process.env.DB_POSTGRES_URL ||
    process.env.DB_POSTGRES_URL_NON_POOLING ||
    process.env.DB_POSTGRES_PRISMA_URL ||
    process.env.DB_DATABASE_URL ||
    process.env.DB_DATABASE_URL_UNPOOLED;

  if (url && url.length > 0) return url;

  throw new Error(
    "Missing Postgres connection string. Set POSTGRES_URL or DATABASE_URL (or DB_POSTGRES_URL from Neon integration) in Vercel."
  );
}

export default buildConfig({
  bin: [
    {
      key: "export:sqlite",
      scriptPath: path.resolve(dirname, "scripts/bin/export-sqlite.cjs"),
    },
    {
      key: "migrate:media:blob",
      scriptPath: path.resolve(dirname, "scripts/bin/migrate-media-to-blob.cjs"),
    },
    {
      key: "import:neon",
      scriptPath: path.resolve(dirname, "scripts/bin/import-to-neon.cjs"),
    },
    {
      key: "verify:neon",
      scriptPath: path.resolve(dirname, "scripts/bin/verify-neon.cjs"),
    },
  ],
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
        connectionString: getPostgresConnectionString(),
        push:
          process.env.PAYLOAD_DB_PUSH === "true" ||
          (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1"),
      })
    : sqliteAdapter({
        client: {
          url: process.env.DATABASE_URL || "file:./payload.db",
        },
        // Avoid schema push on existing SQLite DBs unless explicitly enabled.
        // (Some environments already have the schema and push can fail on re-creating indexes.)
        push: process.env.PAYLOAD_SQLITE_PUSH === "true",
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

