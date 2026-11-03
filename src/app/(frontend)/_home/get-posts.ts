import { getPayload } from "payload";

import config from "@payload-config";
import type { PostListItem } from "./grid";
import type { SceneImage } from "./intro-scene";

// All posts, newest first, shaped for the final site: `posts` for the mosaic
// grid (every post) and `images` for the intro scene (only posts with an image).
export async function getPosts(): Promise<{
  posts: PostListItem[];
  images: SceneImage[];
}> {
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

  return { posts, images };
}
