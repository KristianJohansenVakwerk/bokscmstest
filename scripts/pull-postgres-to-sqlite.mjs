import { execSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

async function loadDotEnvFile(filePath) {
  let content = ''
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch {
    return
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue

    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()

    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // Don't override explicitly-set env vars.
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function run(command, env = {}) {
  execSync(command, { stdio: 'inherit', env: { ...process.env, ...env } })
}

function hasFlag(name) {
  return process.argv.includes(name)
}

async function rmIfExists(p) {
  try {
    await fs.rm(p, { force: true, recursive: true })
  } catch {
    // ignore
  }
}

async function main() {
  // `node scripts/...` does not load Next's env files automatically.
  // Load common local env files so PULL_MEDIA_BASE_URL etc are available.
  const repoRoot = process.cwd()
  await loadDotEnvFile(path.resolve(repoRoot, '.env'))
  await loadDotEnvFile(path.resolve(repoRoot, '.env.local'))
  await loadDotEnvFile(path.resolve(repoRoot, '.env.development.local'))

  const force = hasFlag('--force') || hasFlag('-f')
  if (!force) {
    throw new Error(
      'Refusing to overwrite local SQLite DB. Re-run with --force to delete payload.db and rebuild it from Postgres.',
    )
  }

  const sqlitePath = path.resolve(repoRoot, 'payload.db')
  const mediaDir = path.resolve(repoRoot, 'media')

  // 1) Export from Postgres
  run('npx payload export:postgres', {
    PAYLOAD_USE_POSTGRES: '1',
  })

  // Find newest export file.
  const backupsDir = path.resolve(repoRoot, 'backups')
  const entries = await fs.readdir(backupsDir)
  const candidates = entries
    .filter((f) => f.startsWith('payload_export_postgres_') && f.endsWith('.json'))
    .map((f) => path.join(backupsDir, f))

  if (candidates.length === 0) {
    throw new Error('No Postgres export found in backups/. Did export:postgres run successfully?')
  }

  let newest = candidates[0]
  let newestMtime = (await fs.stat(newest)).mtimeMs
  for (const c of candidates.slice(1)) {
    const m = (await fs.stat(c)).mtimeMs
    if (m > newestMtime) {
      newest = c
      newestMtime = m
    }
  }

  // 2) Wipe local sqlite + media dir and re-import
  await rmIfExists(sqlitePath)
  await rmIfExists(mediaDir)

  run(`npx payload import:sqlite "${newest}"`, {
    PAYLOAD_USE_POSTGRES: '0',
    DATABASE_URL: 'file:./payload.db',
    // Ensure the DB schema is created for a fresh payload.db.
    // (The repo's migrations are Postgres-specific; local SQLite relies on schema push.)
    PAYLOAD_SQLITE_PUSH: 'true',
    // Used when exported media urls are relative (e.g. /api/media/file/...)
    PULL_MEDIA_BASE_URL:
      process.env.PULL_MEDIA_BASE_URL ||
      process.env.PAYLOAD_PUBLIC_SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      '',
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

