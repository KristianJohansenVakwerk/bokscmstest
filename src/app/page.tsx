import { headers } from "next/headers";
import Link from "next/link";
import { getPayload } from "payload";

import config from "@payload-config";

async function fetchDropboxApi<T>(pathname: string): Promise<T> {
  const headersList = await headers();
  const host = headersList.get("host");

  if (!host) {
    throw new Error("Could not determine host");
  }

  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const res = await fetch(`${protocol}://${host}${pathname}`, {
    cache: "no-store",
  });

  return res.json();
}

export default async function Home() {
  let folder: unknown = null;
  let folderError: string | null = null;
  let file: unknown = null;
  let fileError: string | null = null;
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
    folder = await fetchDropboxApi("/api/dropbox/folder");
  } catch {
    folderError = "Failed to load folder contents";
  }

  // If you set DROPBOX_EXAMPLE_FILE_PATH in .env, we’ll fetch its contents too.
  if (process.env.DROPBOX_EXAMPLE_FILE_PATH) {
    try {
      const qp = new URLSearchParams({ path: process.env.DROPBOX_EXAMPLE_FILE_PATH });
      file = await fetchDropboxApi(`/api/dropbox/file?${qp.toString()}`);
    } catch {
      fileError = "Failed to load file contents";
    }
  }

  try {
    const payload = await getPayload({ config });
    const result = await payload.find({
      collection: "posts",
      depth: 1,
      limit: 50,
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

        {process.env.DROPBOX_EXAMPLE_FILE_PATH ? (
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
