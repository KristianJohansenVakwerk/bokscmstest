const fs = require('node:fs/promises')
const path = require('node:path')
const { getPayload } = require('payload')

module.exports.script = async function script(config) {
  const jsonArgs = process.argv.filter((arg) => typeof arg === 'string' && arg.endsWith('.json'))
  const exportPath = jsonArgs[0]
  const mediaMapPath = jsonArgs[1] || path.resolve(process.cwd(), 'backups/media_id_map.json')

  if (!exportPath) {
    throw new Error('Usage: payload import:neon <payload_export_sqlite_*.json> [media_id_map.json]')
  }

  const exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'))
  const mediaMap = JSON.parse(await fs.readFile(mediaMapPath, 'utf8'))
  const idMap = mediaMap?.idMap || {}

  const payload = await getPayload({ config })

  const users = Array.isArray(exportData.users) ? exportData.users : []
  for (const user of users) {
    const email = user?.email
    if (!email) continue

    const existing = await payload.find({
      collection: 'users',
      limit: 1,
      overrideAccess: true,
      where: { email: { equals: email } },
    })
    if (existing.docs.length > 0) continue

    await payload.create({
      collection: 'users',
      overrideAccess: true,
      data: {
        email,
        displayName: user.displayName ?? null,
        password: globalThis.crypto.randomUUID(),
      },
    })
  }

  const posts = Array.isArray(exportData.posts) ? exportData.posts : []
  for (const post of posts) {
    if (!post?.slug) continue

    const existing = await payload.find({
      collection: 'posts',
      limit: 1,
      overrideAccess: true,
      where: { slug: { equals: post.slug } },
    })
    if (existing.docs.length > 0) continue

    let imageId = null
    const image = post.image
    if (image && typeof image === 'object' && 'id' in image) imageId = idMap[String(image.id)] ?? null
    else if (image) imageId = idMap[String(image)] ?? null

    await payload.create({
      collection: 'posts',
      overrideAccess: true,
      data: {
        title: post.title,
        slug: post.slug,
        content: post.content ?? null,
        image: imageId,
        dropbox: post.dropbox ?? undefined,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      },
    })
  }

  console.log('Import complete')
}

