import { execSync } from 'node:child_process'

function run(command) {
  execSync(command, { stdio: 'inherit' })
}

// On Vercel we need to ensure migrations run so tables exist.
// Locally we usually run SQLite and don't want to require a Postgres connection at build time.
if (process.env.VERCEL === '1') {
  run('payload migrate')
}

run('next build')

