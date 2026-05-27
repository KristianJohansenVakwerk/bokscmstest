# Migration handoff (SQLite → Neon/Vercel Postgres + Vercel Blob)

This repo was migrated from a local SQLite database (`payload.db`) to Neon/Vercel Postgres, and local uploads were migrated to Vercel Blob.

## What was done

- **Backups created locally** (not committed):
  - `backups/payload_<timestamp>.db` (SQLite backup)
  - `backups/media_<timestamp>.tgz` (local uploads snapshot)
  - `backups/payload_export_sqlite_<timestamp>.json` (export of `users`, `media`, `posts`)
  - `backups/media_id_map.json` (map of old SQLite media IDs → new Postgres media IDs)

- **Initial Postgres migration generated and committed**:
  - `src/migrations/20260527_110701.ts`
  - `src/migrations/20260527_110701.json`
  - `src/migrations/index.ts`

- **Migration / import scripts added as Payload bin scripts** (committed):
  - `scripts/bin/export-sqlite.cjs`
  - `scripts/bin/migrate-media-to-blob.cjs`
  - `scripts/bin/import-to-neon.cjs`
  - `scripts/bin/verify-neon.cjs`

- **Config hardening** (committed):
  - `payload.config.ts`
    - `push` is **disabled on Vercel by default** (can be enabled explicitly with `PAYLOAD_DB_PUSH=true`).
    - SQLite adapter `push` is **off by default** (enable with `PAYLOAD_SQLITE_PUSH=true`) to avoid “index already exists” failures on an existing SQLite DB.
    - Bin scripts are registered under `buildConfig({ bin: [...] })`.
  - `src/app/(payload)/admin/importMap.js` updated to include the Vercel Blob client upload handler.

- **Ignored local data artifacts**:
  - `.gitignore` now ignores `payload.db`, `backups/`, and `Untitled`.

## Why “data disappeared” during the process

Payload selects Postgres when `VERCEL=1` or when a Postgres connection string is present. If you point the app at Neon (`POSTGRES_URL`), you’ll see an empty DB until you import your SQLite data.

## Required environment variables

### For SQLite export (local source of truth)
- `DATABASE_URL=file:./payload.db`
- `PAYLOAD_SECRET=...` (dev secret is fine locally)
- Ensure Postgres env vars are **not** set for this step (or set `POSTGRES_URL=` empty).

### For Neon/Vercel Postgres + Blob (destination)
- `POSTGRES_URL=...` (**important**: Vercel Postgres client expects `POSTGRES_URL`, not only `DATABASE_URL`)
- `BLOB_READ_WRITE_TOKEN=...`
- `PAYLOAD_SECRET=...`
- Recommended in production:
  - `PAYLOAD_DB_PUSH=false`

## Commands (repeatable)

### 1) Create schema on Neon (migrations)

```bash
npm run migrate
```

### 2) Export from SQLite

```bash
# ensure DATABASE_URL points to sqlite and POSTGRES_URL is empty
npm run export:sqlite
```

This prints the export path, e.g. `backups/payload_export_sqlite_YYYYMMDD_HHMMSS.json`.

### 3) Upload media to Blob (writes to Postgres + Blob)

```bash
npm run migrate:media:blob -- backups/payload_export_sqlite_YYYYMMDD_HHMMSS.json
```

This writes `backups/media_id_map.json`.

### 4) Import users/posts to Neon and relink images

```bash
npm run import:neon -- backups/payload_export_sqlite_YYYYMMDD_HHMMSS.json backups/media_id_map.json
```

Notes:
- Auth hashes are not transferred by this API-level import; users are created and will need password resets if you had real users.

### 5) Verify Neon counts

```bash
npx payload verify:neon
```

## Where to look in the code
- `payload.config.ts`: adapters, `shouldUsePostgres()`, bin scripts, and push hardening
- `src/migrations/*`: initial Postgres schema migration
- `scripts/bin/*.cjs`: operational scripts for export/blob/import/verify

