const { getPayload } = require('payload')

function parseArgs() {
  const args = process.argv.slice(2)
  let email = process.env.RESET_EMAIL || null
  let password = process.env.RESET_PASSWORD || null

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]
    if (a === '--email') {
      email = args[i + 1]
      i += 1
    } else if (a === '--password') {
      password = args[i + 1]
      i += 1
    } else if (a.startsWith('--email=')) {
      email = a.slice('--email='.length)
    } else if (a.startsWith('--password=')) {
      password = a.slice('--password='.length)
    }
  }

  return { email, password }
}

module.exports.script = async function script(config) {
  const { email, password } = parseArgs()

  if (!email || !password) {
    console.error(
      'Usage: payload reset:password --email <email> --password <new-password>',
    )
    console.error('Or set RESET_EMAIL / RESET_PASSWORD env vars.')
    process.exit(1)
  }

  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
    showHiddenFields: true,
  })

  const user = existing.docs[0]

  if (!user) {
    console.log(`No user found for ${email}. Creating a new admin user...`)
    const created = await payload.create({
      collection: 'users',
      data: { email, password },
      overrideAccess: true,
    })
    console.log(`Created user id=${created.id} email=${created.email}`)
    return
  }

  await payload.update({
    collection: 'users',
    id: user.id,
    data: { password },
    overrideAccess: true,
  })

  console.log(`Password updated for ${email} (user id=${user.id}).`)
}
