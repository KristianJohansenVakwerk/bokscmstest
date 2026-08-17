import { getPayload } from "payload";

import config from "@payload-config";
import Wall from "./wall";

export const dynamic = "force-dynamic";

// Iteration 11: the homepage grid rebuilt as a three.js "wall" of textured
// planes. The camera stays put — moving the mouse only pans/tilts its view,
// like glancing around a room, so you never travel through the scene.
export default async function IterationEleven() {
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

  return <Wall images={images} />;
}
