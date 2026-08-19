"use client";

import Image from "next/image";
import { useState } from "react";

type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

// Filename caption, matching the labels used in the intro scene.
function fileNameOf(url: string) {
  const path = decodeURIComponent(url.split("?")[0]);
  return path.slice(path.lastIndexOf("/") + 1) || url;
}

// The landing-page grid, plus a hover caption shown dead center in the big
// "Karl / Monies" title style from the intro.
export default function Grid({ posts }: { posts: PostListItem[] | null }) {
  const [caption, setCaption] = useState<string | null>(null);

  return (
    <div className="relative flex flex-1 flex-col bg-white font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pt-5">
        {posts && posts.length > 0 ? (
          <ul className="grid grid-cols-12 gap-20">
            {posts.map((post) =>
              post.imageUrl ? (
                <li
                  key={String(post.id)}
                  className="relative aspect-square w-full"
                  onMouseEnter={() => setCaption(fileNameOf(post.imageUrl!))}
                  onMouseLeave={() => setCaption(null)}
                >
                  <Image
                    src={post.imageUrl}
                    alt={post.imageAlt ?? post.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 8vw"
                    className="object-contain"
                  />
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600">No posts yet.</p>
        )}
      </main>

      {caption ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center">
          <span
            className="text-center text-black"
            style={{
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
              fontSize: 150,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {caption}
          </span>
        </div>
      ) : null}
    </div>
  );
}
