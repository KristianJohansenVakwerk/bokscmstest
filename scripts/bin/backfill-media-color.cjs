// Backfill `backgroundColor` on existing media docs. New uploads get it from the
// Media collection's beforeChange hook; this fills in everything already stored.
//
// Reads each file's bytes (local `media/` dir first, then its absolute URL if the
// file lives on the Vercel Blob store), computes the whole-image average color
// with sharp, and writes it back. A plain payload.update carries no req.file, so
// the upload hook won't fire — this is the only writer for existing docs.
//
// Usage: pnpm payload backfill:media:color [--force]
//   --force   recompute even for docs that already have a backgroundColor

const fs = require("node:fs/promises");
const path = require("node:path");
const { getPayload } = require("payload");
const sharp = require("sharp");

async function averageColorHex(input) {
  const { data } = await sharp(input)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(1, 1, { fit: "fill" })
    .toColorspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const [r, g, b] = data;
  const hex = (n) => n.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

// Base origin used to fetch files that aren't local and whose stored url isn't
// absolute (e.g. Postgres/blob docs, or the "-1"/"-2" duplicate variants whose
// url is relative). Point MEDIA_BASE_URL at a host that serves /api/media/file/*
// (the deployed site works). No trailing slash.
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
  // Absolute url (blob CDN) — fetch directly.
  if (/^https?:\/\//.test(url)) return fetchBytes(url);
  // Otherwise reconstruct against MEDIA_BASE_URL: join a relative url, or fall
  // back to the canonical file route by filename.
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
  const force = process.argv.includes("--force");
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
      if (doc.backgroundColor && !force) {
        skipped++;
        continue;
      }
      try {
        const buf = await loadBytes(doc);
        const backgroundColor = await averageColorHex(buf);
        await payload.update({
          collection: "media",
          id: doc.id,
          data: { backgroundColor },
          overrideAccess: true,
        });
        updated++;
        console.log(`${doc.filename}: ${backgroundColor}`);
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
