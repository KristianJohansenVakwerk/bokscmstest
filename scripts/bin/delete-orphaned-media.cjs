// Delete media docs that no post references. Repeated Dropbox syncs leave old
// uploads behind (the "-1"/"-2" duplicate filenames); this clears them out.
// Deleting through payload.delete also removes the file from storage (the
// Vercel Blob plugin's afterDelete hook in production, the media/ dir locally).
//
// Usage: pnpm payload delete:media:orphaned [--dry-run]
//   --dry-run   list what would be deleted without deleting anything
//
// Against production Postgres, run with NODE_ENV=production so the adapter
// doesn't push schema changes:
//   NODE_ENV=production PAYLOAD_USE_POSTGRES=1 pnpm payload delete:media:orphaned

const { getPayload } = require("payload");

module.exports.script = async function script(config) {
  const dryRun = process.argv.includes("--dry-run");
  const payload = await getPayload({ config });

  const used = new Set();
  let postCount = 0;
  for (let page = 1; ; page++) {
    const { docs, hasNextPage } = await payload.find({
      collection: "posts",
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
    });
    for (const post of docs) {
      postCount++;
      if (post.image != null) used.add(String(post.image));
    }
    if (!hasNextPage) break;
  }

  // Guard against wiping every image if the posts query comes back empty.
  if (postCount === 0) {
    console.error("No posts found — refusing to delete media.");
    process.exit(1);
  }

  const orphans = [];
  let mediaCount = 0;
  for (let page = 1; ; page++) {
    const { docs, hasNextPage } = await payload.find({
      collection: "media",
      depth: 0,
      limit: 500,
      page,
      overrideAccess: true,
    });
    for (const doc of docs) {
      mediaCount++;
      if (!used.has(String(doc.id))) orphans.push(doc);
    }
    if (!hasNextPage) break;
  }

  const bytes = orphans.reduce((sum, doc) => sum + (doc.filesize ?? 0), 0);
  console.log(
    `posts ${postCount}, media ${mediaCount}, in use ${used.size}, ` +
      `orphaned ${orphans.length} (${(bytes / 1e9).toFixed(2)} GB)`,
  );

  if (dryRun) {
    for (const doc of orphans) console.log(`would delete ${doc.id} ${doc.filename}`);
    process.exit(0);
  }

  let deleted = 0;
  let failed = 0;
  for (const doc of orphans) {
    try {
      await payload.delete({ collection: "media", id: doc.id, overrideAccess: true });
      deleted++;
      console.log(`deleted ${doc.id} ${doc.filename}`);
    } catch (err) {
      failed++;
      console.warn(`${doc.filename}: FAILED ${err.message ?? err}`);
    }
  }

  console.log("-".repeat(50));
  console.log(`deleted ${deleted}, failed ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
};
