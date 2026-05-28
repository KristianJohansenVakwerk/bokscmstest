const fs = require('node:fs/promises')
const path = require('node:path')
const { getPayload } = require('payload')

async function fetchAll(payload, collection) {
  const docs = []
  let page = 1

  while (true) {
    const res = await payload.find({
      collection,
      limit: 100,
      page,
      depth: 0,
      overrideAccess: true,
    })

    docs.push(...res.docs)
    if (page >= res.totalPages) break
    page += 1
  }

  return docs
}

function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`
}

module.exports.script = async function script(config) {
  const outDir = path.resolve(process.cwd(), 'backups')
  await fs.mkdir(outDir, { recursive: true })

  const payload = await getPayload({ config })

  const users = await fetchAll(payload, 'users')
  const media = await fetchAll(payload, 'media')
  const posts = await fetchAll(payload, 'posts')

  const exportData = {
    meta: {
      exportedAt: new Date().toISOString(),
      source: 'postgres',
      collections: ['users', 'media', 'posts'],
    },
    users,
    media,
    posts,
  }

  const outPath = path.join(outDir, `payload_export_postgres_${nowStamp()}.json`)
  await fs.writeFile(outPath, JSON.stringify(exportData, null, 2))
  console.log(outPath)
}

