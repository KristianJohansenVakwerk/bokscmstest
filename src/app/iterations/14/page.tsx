import { getPayload } from "payload";

import config from "@payload-config";
import Scene from "./scene";

export const dynamic = "force-dynamic";

// Iteration 14: like 13, but the layout never overlaps — the five images are
// packed so no two cover each other. Images may still bleed past the top/bottom
// edges of the viewport; that's the only allowed kind of "overlap".
export default async function IterationFourteen() {
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
