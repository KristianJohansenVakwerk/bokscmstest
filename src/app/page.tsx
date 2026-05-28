import { headers } from "next/headers";
import { getPayload } from "payload";

import config from "@payload-config";
import HomepageClient from "./homepage-client";

export const dynamic = "force-dynamic";

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
    <HomepageClient
      folder={folder}
      folderError={folderError}
      file={file}
      fileError={fileError}
      showFileSection={Boolean(process.env.DROPBOX_EXAMPLE_FILE_PATH)}
      posts={posts}
      postsError={postsError}
    />
  );
}
