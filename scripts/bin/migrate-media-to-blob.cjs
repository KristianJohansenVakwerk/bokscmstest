const fs = require('node:fs/promises')
const path = require('node:path')
const { getPayload } = require('payload')

function guessMimeType(filename) {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

module.exports.script = async function script(config) {
  const exportPath = process.argv.find((arg) => typeof arg === 'string' && arg.endsWith('.json'))
  if (!exportPath) {
    throw new Error('Usage: payload migrate:media:blob <payload_export_sqlite_*.json>')
  }

  const exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'))
  const payload = await getPayload({ config })

  const mediaDocs = Array.isArray(exportData.media) ? exportData.media : []
  const localMediaDir = path.resolve(process.cwd(), 'media')

  const idMap = {}
  const results = []

  for (const doc of mediaDocs) {
    const filename = doc?.filename
    if (!filename) continue

    const localPath = path.join(localMediaDir, filename)
    let buf
    try {
      buf = await fs.readFile(localPath)
    } catch {
      results.push({ filename, status: 'missing_local_file', localPath })
      continue
    }

    const created = await payload.create({
      collection: 'media',
      overrideAccess: true,
      data: { alt: doc?.alt ?? null },
      file: {
        data: buf,
        mimetype: guessMimeType(filename),
        name: filename,
        size: buf.length,
      },
    })

    idMap[String(doc.id)] = created.id
    results.push({ filename, status: 'uploaded', fromId: doc.id, toId: created.id, url: created.url })
  }

  const outDir = path.resolve(process.cwd(), 'backups')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, 'media_id_map.json')
  await fs.writeFile(outPath, JSON.stringify({ idMap, results }, null, 2))
  console.log(outPath)
}

