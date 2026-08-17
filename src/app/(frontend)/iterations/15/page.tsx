import { getPayload } from "payload";

import config from "@payload-config";
import Intro from "./intro";

export const dynamic = "force-dynamic";

// Iteration 15: iteration 14 used as an intro — the 5-image scene auto-shuffles
// its layout every 5 seconds. Clicking anywhere leaves the intro and drops into
// the landing-page grid of all images.
export default async function IterationFifteen() {
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
