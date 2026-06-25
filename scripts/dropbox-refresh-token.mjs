import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

async function main() {
  const repoRoot = process.cwd()
  await loadDotEnvFile(path.resolve(repoRoot, '.env'))
  await loadDotEnvFile(path.resolve(repoRoot, '.env.local'))
  await loadDotEnvFile(path.resolve(repoRoot, '.env.development.local'))

  const appKey = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY
  const appSecret = process.env.DROPBOX_APP_SECRET

  if (!appKey) throw new Error('NEXT_PUBLIC_DROPBOX_APP_KEY is not set')
  if (!appSecret) throw new Error('DROPBOX_APP_SECRET is not set')

  const authorizeUrl =
    `https://www.dropbox.com/oauth2/authorize` +
    `?client_id=${encodeURIComponent(appKey)}` +
    `&token_access_type=offline` +
    `&response_type=code`

  console.log('\n1) Open this URL in your browser and approve access:\n')
  console.log(`   ${authorizeUrl}\n`)
  console.log('2) Paste the code Dropbox gives you below.')
  console.log('   (Codes expire within a few minutes — do this promptly.)\n')

  const rl = readline.createInterface({ input, output })
  const code = (await rl.question('Authorization code: ')).trim()
  rl.close()

  if (!code) throw new Error('No code provided')

  const body = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
  })

  const basic = Buffer.from(`${appKey}:${appSecret}`).toString('base64')

  const response = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const json = await response.json()

  if (!response.ok) {
    console.error('\nDropbox returned an error:')
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }

  if (!json.refresh_token) {
    console.error('\nNo refresh_token in response (did you use token_access_type=offline?):')
    console.error(JSON.stringify(json, null, 2))
    process.exit(1)
  }

  console.log('\nSuccess. Add this to Vercel env vars:\n')
  console.log(`DROPBOX_REFRESH_TOKEN=${json.refresh_token}\n`)
  console.log('You can remove DROPBOX_ACCESS_TOKEN from Vercel — the SDK will mint fresh ones from the refresh token.')
}

main().catch((err) => {
  console.error(err.message ?? err)
  process.exit(1)
})
