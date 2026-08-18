import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-vercel-postgres'
import { sql } from '@payloadcms/db-vercel-postgres'

// Add the media.background_color column that backs the average-color placeholder
// (populated on upload by the Media collection's beforeChange hook, and for
// existing rows by `pnpm backfill:media:color`).
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN IF NOT EXISTS "background_color" varchar;
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN IF EXISTS "background_color";
  `)
}
