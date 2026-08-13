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

async function download(url, { retries = 3 } = {}) {
  // Node 18+ has global fetch. Next 16 requires Node 18+.
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) {
        // Non-2xx: retry only on 5xx/429; 404 etc are permanent.
        if (res.status >= 500 || res.status === 429) {
          lastErr = new Error(`Failed to download media (${res.status} ${res.statusText}): ${url}`)
        } else {
          throw new Error(`Failed to download media (${res.status} ${res.statusText}): ${url}`)
        }
      } else {
        const arrayBuffer = await res.arrayBuffer()
        return Buffer.from(arrayBuffer)
      }
    } catch (err) {
      lastErr = err
    }

    if (attempt < retries) {
      const backoffMs = 1000 * 2 ** attempt
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastErr
}

function resolveRemoteUrl(url, filename) {
  if (typeof url !== 'string' || url.length === 0) return null

  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://')) return url

  // When media is stored on Vercel Blob, the site's /api/media/file/<name>
  // endpoint is unreliable, but the raw file is served directly from the
  // Blob CDN under the filename as key. Prefer that when configured.
  const blobBase = process.env.PULL_MEDIA_BLOB_BASE_URL
  if (blobBase && filename && url.startsWith('/api/media/file/')) {
    return new URL(filename, blobBase.endsWith('/') ? blobBase : blobBase + '/').toString()
  }

  // Relative URLs need a base pointing at the remote site that produced the export.
  if (url.startsWith('/')) {
    const base =
      process.env.PULL_MEDIA_BASE_URL ||
      process.env.PAYLOAD_PUBLIC_SERVER_URL ||
      process.env.NEXT_PUBLIC_SERVER_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)

    if (!base) {
      throw new Error(
        `Media url is relative ("${url}"). Set PULL_MEDIA_BASE_URL=https://<your-remote-domain> so the importer can download media.`,
      )
    }

    return new URL(url, base).toString()
  }

  return url
}

module.exports.script = async function script(config) {
  const jsonArgs = process.argv.filter((arg) => typeof arg === 'string' && arg.endsWith('.json'))
  const exportPath = jsonArgs[0]

  if (!exportPath) {
    throw new Error('Usage: payload import:sqlite <payload_export_postgres_*.json|payload_export_sqlite_*.json>')
  }

  const exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'))
  const payload = await getPayload({ config })

  // 1) Users
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
        // Auth hashes are not portable via this import path.
        password: globalThis.crypto.randomUUID(),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    })
  }

  // 2) Media (download from url and re-upload into local storage)
  const mediaDocs = Array.isArray(exportData.media) ? exportData.media : []
  const mediaIdMap = {}

  for (let i = 0; i < mediaDocs.length; i += 1) {
    const doc = mediaDocs[i]
    const filename = doc?.filename
    const url = doc?.url
    if (!filename || !url) continue

    // Idempotent: skip if a media doc with this filename already exists locally.
    const existing = await payload.find({
      collection: 'media',
      limit: 1,
      overrideAccess: true,
      where: { filename: { equals: filename } },
    })
    if (existing.docs.length > 0) {
      mediaIdMap[String(doc.id)] = existing.docs[0].id
      continue
    }

    const remoteUrl = resolveRemoteUrl(url, filename)
    if (!remoteUrl) continue

    console.log(`[media ${i + 1}/${mediaDocs.length}] ${filename}`)
    let buf
    try {
      buf = await download(remoteUrl)
    } catch (err) {
      // Skip media that no longer exists at the remote (orphaned DB row).
      // Posts referencing this media will have image=null after import.
      if (String(err?.message || '').includes('404')) {
        console.warn(`  -> skipping (remote missing): ${filename}`)
        continue
      }
      throw err
    }
    const created = await payload.create({
      collection: 'media',
      overrideAccess: true,
      data: { alt: doc?.alt ?? null, createdAt: doc.createdAt, updatedAt: doc.updatedAt },
      file: {
        data: buf,
        mimetype: guessMimeType(filename),
        name: filename,
        size: buf.length,
      },
    })

    mediaIdMap[String(doc.id)] = created.id
  }

  // 3) Posts
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
    if (image && typeof image === 'object' && 'id' in image) imageId = mediaIdMap[String(image.id)] ?? null
    else if (image) imageId = mediaIdMap[String(image)] ?? null

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

