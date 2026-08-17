import Image from "next/image";
import { getPayload } from "payload";

import config from "@payload-config";

export const dynamic = "force-dynamic";

// Iteration 9: no randomness — a dense 20-column contact sheet of every post,
// each image one column wide, square and cover-cropped.
const COLS = 17;
const GUTTER_PX = 0; // edge-to-edge contact sheet

export default async function IterationNine() {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "posts",
    depth: 1,
    limit: 0, // all posts
    sort: "-createdAt",
  });

  const items = result.docs.flatMap((doc) => {
    const image =
      doc.image && typeof doc.image === "object"
        ? (doc.image as { url?: string | null; alt?: string | null })
        : null;
    if (!image?.url) return [];
    return [{ id: doc.id, url: image.url, alt: image.alt ?? doc.title }];
  });

  return (
    <main className="px-5 pt-5">
      <ul
        className="grid list-none"
        style={{
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
          gap: `${GUTTER_PX}px`,
        }}
      >
        {items.map((it) => (
          <li key={String(it.id)} className="relative aspect-square">
            <Image
              src={it.url}
              alt={it.alt}
              fill
              sizes="6vw"
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </main>
  );
}
