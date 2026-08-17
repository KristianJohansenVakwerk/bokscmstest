import { getPayload } from "payload";

import config from "@payload-config";
import HomepageClient from "./homepage-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  let posts:
    | Array<{
        id: string | number;
        title: string;
        slug: string;
        imageUrl: string | null;
        imageAlt: string | null;
      }>
    | null = null;
  let postsError: string | null = null;

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "posts",
      depth: 1,
      limit: 0,
      sort: "-createdAt",
    });

    posts = result.docs.map((doc) => {
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
  } catch {
    postsError = "Failed to load posts from Payload";
  }

  return <HomepageClient posts={posts} postsError={postsError} />;
}
