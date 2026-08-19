import { getPayload } from "payload";

import config from "@payload-config";
import Intro from "./intro";

export const dynamic = "force-dynamic";

// Iteration 23: like 22, but the intro shows the full grid (every image) with
// the SVG wordmark laid over it — no crossfade rotation. Clicking fades the
// wordmark out and hands off to the same interactive grid.
export default async function IterationTwentyThree() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 0, // all posts
    sort: "-createdAt",
  });

  const posts = result.docs.map((doc) => {
    const image =
      doc.image && typeof doc.image === "object"
        ? (doc.image as {
            url?: string | null;
            alt?: string | null;
            backgroundColor?: string | null;
            width?: number | null;
            height?: number | null;
          })
        : null;
    return {
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
      backgroundColor: image?.backgroundColor ?? null,
      width: image?.width ?? null,
      height: image?.height ?? null,
    };
  });

  return <Intro posts={posts} />;
}
