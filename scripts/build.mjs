import { execSync } from 'node:child_process'

function run(command) {
  execSync(command, { stdio: 'inherit' })
}

// On Vercel we need to ensure migrations run so tables exist.
// Locally we usually run SQLite and don't want to require a Postgres connection at build time.
if (process.env.VERCEL === '1') {
  // Run migrations when any recognized Postgres connection string is present.
  // This MUST match the var list resolved in payload.config.ts's
  // getPostgresConnectionString — otherwise the app connects (via e.g. Neon's
  // DATABASE_URL) but the build skips `payload migrate`, leaving new columns
  // missing and every DB query 500ing at runtime.
  const POSTGRES_URL_VARS = [
    'POSTGRES_URL',
    'DATABASE_URL',
    'DB_POSTGRES_URL',
    'DB_POSTGRES_URL_NON_POOLING',
    'DB_POSTGRES_PRISMA_URL',
    'DB_DATABASE_URL',
    'DB_DATABASE_URL_UNPOOLED',
  ]
  const hasPostgresUrl = POSTGRES_URL_VARS.some((v) => Boolean(process.env[v]))
  const shouldForceMigrate = process.env.PAYLOAD_FORCE_MIGRATE === '1'

  if (shouldForceMigrate || hasPostgresUrl) {
    run('payload migrate')
  } else {
    console.warn(
      '[build] Skipping `payload migrate` because no Postgres connection string ' +
        `is set (checked: ${POSTGRES_URL_VARS.join(', ')}). ` +
        'Set one, or set PAYLOAD_FORCE_MIGRATE=1 to force.'
    )
  }
}

run('next build')

