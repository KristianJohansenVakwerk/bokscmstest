import { getPayload } from "payload";

import config from "@payload-config";
import Scene from "./scene";

export const dynamic = "force-dynamic";

// Iteration 13: a three.js stage that shows 5 random images laid out in a
// 12-column grid (portraits span 1 or 3 cols, landscapes 3 or 5). Clicking
// flings the current five out and flies five new ones in with a fresh random
// layout. A fixed "Karl / Monies" title sits dead center over the scene.
export default async function IterationThirteen() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 0, // all posts
    sort: "-createdAt",
  });

  const images = result.docs.flatMap((doc) => {
    const image =
      doc.image && typeof doc.image === "object"
        ? (doc.image as {
            url?: string | null;
            alt?: string | null;
            width?: number | null;
            height?: number | null;
          })
        : null;
    if (!image?.url) return [];
    return [
      {
        id: String(doc.id),
        url: image.url,
        alt: image.alt ?? doc.title,
        width: Number(image.width) || 1,
        height: Number(image.height) || 1,
      },
    ];
  });

  return <Scene images={images} />;
}
