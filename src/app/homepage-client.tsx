"use client";

import Link from "next/link";

type PostListItem = {
  id: string | number;
  title: string;
  slug: string;
  imageUrl: string | null;
  imageAlt: string | null;
};

export type HomepageClientProps = {
  folder: unknown;
  folderError: string | null;
  file: unknown;
  fileError: string | null;
  showFileSection: boolean;
  posts: PostListItem[] | null;
  postsError: string | null;
};

export default function HomepageClient({
  folder,
  folderError,
  file,
  fileError,
  showFileSection,
  posts,
  postsError,
}: HomepageClientProps) {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Dropbox folder
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Set <code className="text-zinc-800 dark:text-zinc-200">DROPBOX_FOLDER_PATH</code>{" "}
            in <code className="text-zinc-800 dark:text-zinc-200">.env</code> (e.g.{" "}
            <code className="text-zinc-800 dark:text-zinc-200">/my-site</code>). Empty string
            lists the account root.
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Optional: set{" "}
            <code className="text-zinc-800 dark:text-zinc-200">
              DROPBOX_EXAMPLE_FILE_PATH
            </code>{" "}
            to download a specific file (e.g.{" "}
            <code className="text-zinc-800 dark:text-zinc-200">/content.json</code>).
          </p>

          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
            Payload Admin:{" "}
            <Link className="text-zinc-900 underline dark:text-zinc-50" href="/admin">
              /admin
            </Link>
          </p>
        </div>

        <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Posts</h2>
          {postsError ? (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{postsError}</p>
          ) : posts && posts.length > 0 ? (
            <ul className="mt-3 grid gap-4 sm:grid-cols-2">
              {posts.map((post) => (
                <li
                  key={String(post.id)}
                  className="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
                >
                  {post.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.imageUrl}
                      alt={post.imageAlt ?? post.title}
                      className="aspect-video w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-zinc-100 text-xs text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                      No image
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-medium text-zinc-900 dark:text-zinc-50">{post.title}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{post.slug}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              No posts yet. Try syncing from Dropbox via{" "}
              <code className="text-zinc-800 dark:text-zinc-200">POST /api/dropbox/sync</code>.
            </p>
          )}
        </section>

        {folderError ? (
          <p className="text-red-600 dark:text-red-400">{folderError}</p>
        ) : (
          <pre className="overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            {JSON.stringify(folder, null, 2)}
          </pre>
        )}

        {showFileSection ? (
          fileError ? (
            <p className="text-red-600 dark:text-red-400">{fileError}</p>
          ) : (
            <pre className="overflow-auto rounded-lg border border-zinc-200 bg-white p-4 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {JSON.stringify(file, null, 2)}
            </pre>
          )
        ) : null}
      </main>
    </div>
  );
}

