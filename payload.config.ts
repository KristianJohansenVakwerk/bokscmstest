import path from "path";
import { fileURLToPath } from "url";

import { buildConfig } from "payload";
import { sqliteAdapter } from "@payloadcms/db-sqlite";
import sharp from "sharp";

import { Users } from "./src/payload/collections/Users";
import { Posts } from "./src/payload/collections/Posts";
import { Media } from "./src/payload/collections/Media";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

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
  secret: process.env.PAYLOAD_SECRET || "dev-payload-secret-change-me",
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "src/payload/payload-types.ts"),
  },
  db: sqliteAdapter({
    client: {
      url: process.env.DATABASE_URL || "file:./payload.db",
    },
  }),
});

