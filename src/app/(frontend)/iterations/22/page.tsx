import { getPayload } from "payload";

import config from "@payload-config";
import Intro from "./intro";

export const dynamic = "force-dynamic";

// Iteration 22: drops the three.js scene entirely. The intro is a plain DOM
// scatter that fades in 15 random grid images behind/in front of the SVG
// wordmark; clicking drops into the same centered thumbnail grid as 21.
export default async function IterationTwentyTwo() {
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
