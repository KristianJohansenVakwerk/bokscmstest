import { getPayload } from "payload";

import config from "@payload-config";
import Intro from "./intro";

export const dynamic = "force-dynamic";

// Iteration 19: same three.js intro as iteration 18. The grid becomes an inline
// flow of caption-then-image pairs (caption always visible, Graphik-Regular 50px)
// with smaller thumbnails, keeping the lazy-load and hover preview.
export default async function IterationNineteen() {
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

  // Landing-page grid shape (matches HomepageClient's expectations).
  const posts = result.docs.map((doc) => {
    const image =
      doc.image && typeof doc.image === "object"
        ? (doc.image as { url?: string | null; alt?: string | null })
        : null;
    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
    };
  });

  return <Intro images={images} posts={posts} />;
}
