// Backfill EXIF-corrected `width`/`height` on existing media docs. New uploads
// get oriented dimensions from the Media collection's beforeChange hook; this
// fixes everything already stored (Payload records the raw, pre-rotation size,
// so photos with an EXIF orientation of 5-8 have their width/height swapped).
//
// Reads each file's bytes (local `media/` dir first, then its absolute URL if the
// file lives on the Vercel Blob store), reads the real oriented size with sharp,
// and writes it back only when it differs from what's stored (idempotent). A
// plain payload.update carries no req.file, so the upload hook won't fire — this
// is the only writer for existing docs.
//
// Usage: pnpm payload backfill:media:dimensions

const fs = require("node:fs/promises");
const path = require("node:path");
const { getPayload } = require("payload");
const sharp = require("sharp");

async function orientedSize(input) {
  const meta = await sharp(input).metadata();
  if (!meta.width || !meta.height) return null;
  const swap = typeof meta.orientation === "number" && meta.orientation >= 5;
  return swap
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

// Base origin used to fetch files that aren't local and whose stored url isn't
// absolute. Point MEDIA_BASE_URL at a host that serves /api/media/file/* (the
// deployed site works). No trailing slash.
const MEDIA_BASE_URL = (process.env.MEDIA_BASE_URL || "").replace(/\/+$/, "");

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function loadBytes(doc) {
  // Prefer the local file (sqlite/local-disk dev); fall back to the URL (blob).
  const localPath = path.resolve(process.cwd(), "media", doc.filename ?? "");
  try {
    return await fs.readFile(localPath);
  } catch {
    /* fall through to URL */
  }
  const url = doc.url ?? "";
  if (/^https?:\/\//.test(url)) return fetchBytes(url);
  if (MEDIA_BASE_URL) {
    if (url.startsWith("/")) return fetchBytes(MEDIA_BASE_URL + url);
    if (doc.filename)
      return fetchBytes(
        `${MEDIA_BASE_URL}/api/media/file/${encodeURIComponent(doc.filename)}`,
      );
  }
  throw new Error(
    `no local file and no usable URL for ${doc.filename} ` +
      `(set MEDIA_BASE_URL to a host serving /api/media/file/*)`,
  );
}

module.exports.script = async function script(config) {
  const payload = await getPayload({ config });

  let page = 1;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (;;) {
    const { docs, hasNextPage } = await payload.find({
      collection: "media",
      depth: 0,
      limit: 100,
      page,
    });
    if (docs.length === 0) break;

    for (const doc of docs) {
      try {
        const buf = await loadBytes(doc);
        const size = await orientedSize(buf);
        if (!size) {
          skipped++;
          continue;
        }
        if (size.width === doc.width && size.height === doc.height) {
          skipped++;
          continue;
        }
        await payload.update({
          collection: "media",
          id: doc.id,
          data: { width: size.width, height: size.height },
          overrideAccess: true,
        });
        updated++;
        console.log(
          `${doc.filename}: ${doc.width}x${doc.height} -> ${size.width}x${size.height}`,
        );
      } catch (err) {
        failed++;
        console.warn(`${doc.filename}: FAILED ${err.message ?? err}`);
      }
    }

    if (!hasNextPage) break;
    page++;
  }

  console.log("-".repeat(50));
  console.log(`updated ${updated}, skipped ${skipped}, failed ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
};
