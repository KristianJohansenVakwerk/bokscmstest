import { getPayload } from "payload";

import config from "@payload-config";
import Home from "./home";
import type { PostListItem } from "../../_home/grid";
import type { SceneImage } from "./scene";

export const dynamic = "force-dynamic";

// Iteration 26: the final site (/) with the intro wordmark as a jelly mesh in
// three.js that sticks to passing images. See home.tsx and scene.tsx.
export default async function IterationTwentySix() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 0, // all posts
    sort: "-createdAt",
  });

  const posts: PostListItem[] = [];
  const images: SceneImage[] = [];
  for (const doc of result.docs) {
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

    posts.push({
      id: doc.id,
      title: doc.title,
      slug: doc.slug,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
      backgroundColor: image?.backgroundColor ?? null,
      width: image?.width ?? null,
      height: image?.height ?? null,
    });

    if (image?.url) {
      images.push({
        id: String(doc.id),
        url: image.url,
        alt: image.alt ?? doc.title,
        width: Number(image.width) || 1,
        height: Number(image.height) || 1,
      });
    }
  }

  return <Home posts={posts} images={images} />;
}
