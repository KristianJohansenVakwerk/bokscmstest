"use client";

import Image from "next/image";

type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type HomepageClientProps = {
  posts: PostListItem[] | null;
  postsError: string | null;
};

export default function HomepageClient({ posts, postsError }: HomepageClientProps) {
  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans">
      <main className="flex w-full flex-1 flex-col px-5 pt-5">
        {postsError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{postsError}</p>
        ) : posts && posts.length > 0 ? (
          <ul className="grid grid-cols-12 gap-20">
            {posts.map((post) =>
              post.imageUrl ? (
                <li key={String(post.id)} className="relative aspect-square w-full">
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No posts yet. Try syncing from Dropbox via{" "}
            <code className="text-zinc-800 dark:text-zinc-200">POST /api/dropbox/sync</code>.
          </p>
        )}
      </main>
    </div>
  );
}
