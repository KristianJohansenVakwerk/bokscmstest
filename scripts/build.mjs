import { execSync } from 'node:child_process'

function run(command) {
  execSync(command, { stdio: 'inherit' })
}

// On Vercel we need to ensure migrations run so tables exist.
// Locally we usually run SQLite and don't want to require a Postgres connection at build time.
if (process.env.VERCEL === '1') {
  // Vercel Postgres (and @vercel/postgres) expects POSTGRES_URL.
  // If it's not set, attempting a migration fails the build.
  const hasPostgresUrl = Boolean(process.env.POSTGRES_URL)
  const shouldForceMigrate = process.env.PAYLOAD_FORCE_MIGRATE === '1'

  if (shouldForceMigrate || hasPostgresUrl) {
    run('payload migrate')
  } else {
    console.warn(
      '[build] Skipping `payload migrate` because POSTGRES_URL is not set. ' +
        'Set POSTGRES_URL (Vercel Postgres integration) or set PAYLOAD_FORCE_MIGRATE=1 to force.'
    )
  }
}

run('next build')

