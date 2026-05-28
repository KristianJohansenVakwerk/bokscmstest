import type { files } from "dropbox";
import { DropboxResponseError } from "dropbox";
import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { createHmac, timingSafeEqual } from "node:crypto";

import config from "@payload-config";

import { getDropboxClient } from "@/lib/dropbox";
import { getDropboxFolderPath, listDropboxFolder } from "@/lib/dropbox-folder";
import {
  bufferFromDropboxDownloadResult,
  isImageFile,
  mimeTypeFromFilename,
} from "@/lib/dropbox-image";

type PayloadInstance = Awaited<ReturnType<typeof getPayload>>;

function assertFileMetadata(
  entry: files.MetadataReference,
): entry is files.FileMetadataReference {
  return (entry as { ".tag"?: string })[".tag"] === "file";
}

function isDropboxNotFoundError(error: unknown) {
  if (!(error instanceof DropboxResponseError)) return false;
  if (error.status !== 409) return false;
  try {
    const serialized = JSON.stringify(error.error ?? {});
    return serialized.includes("not_found");
  } catch {
    return false;
  }
}

function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot <= 0) return filename;
  return filename.slice(0, lastDot);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function findExistingByDropboxPathLower(payload: PayloadInstance, pathLower: string) {
  const result = await payload.find({
    collection: "posts",
    limit: 1,
    where: {
      "dropbox.pathLower": {
        equals: pathLower,
      },
    },
  });

  return result.docs[0] ?? null;
}

async function findExistingBySlug(payload: PayloadInstance, slug: string) {
  const result = await payload.find({
    collection: "posts",
    limit: 1,
    where: {
      slug: {
        equals: slug,
      },
    },
  });

  return result.docs[0] ?? null;
}

async function getUniqueSlug(payload: PayloadInstance, baseSlug: string) {
  let candidate = baseSlug || "post";
  let i = 0;

  while (await findExistingBySlug(payload, candidate)) {
    i += 1;
    candidate = `${baseSlug || "post"}-${i}`;
  }

  return candidate;
}

async function downloadDropboxFile(path: string) {
  const dbx = getDropboxClient();
  const { result } = await dbx.filesDownload({ path });
  return bufferFromDropboxDownloadResult(result);
}

async function deletePostById(payload: PayloadInstance, id: string) {
  return payload.delete({
    collection: "posts",
    id,
    overrideAccess: true,
  });
}

async function listAllDropboxPosts(payload: PayloadInstance) {
  const docs: Array<{ id: unknown; dropbox?: { pathLower?: string | null } | null }> = [];
  let page = 1;

  while (true) {
    const result = await payload.find({
      collection: "posts",
      limit: 100,
      page,
      where: {
        "dropbox.pathLower": {
          exists: true,
        },
      },
      overrideAccess: true,
    });

    docs.push(
      ...(result.docs as Array<{ id: unknown; dropbox?: { pathLower?: string | null } | null }>),
    );

    if (!result.hasNextPage) break;
    page += 1;
  }

  return docs;
}

async function uploadImageToMedia(
  payload: PayloadInstance,
  file: Buffer,
  filename: string,
  alt: string,
) {
  return payload.create({
    collection: "media",
    data: {
      alt,
    },
    file: {
      data: file,
      mimetype: mimeTypeFromFilename(filename),
      name: filename,
      size: file.length,
    },
  });
}

function verifyDropboxSignatureOrThrow(rawBody: string, signatureHeader: string) {
  const secret = process.env.DROPBOX_APP_SECRET;
  if (!secret) {
    throw new Error("DROPBOX_APP_SECRET is not set");
  }

  const computedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const providedHex = signatureHeader.trim().toLowerCase();

  const computed = Buffer.from(computedHex, "utf8");
  const provided = Buffer.from(providedHex, "utf8");

  if (computed.length !== provided.length || !timingSafeEqual(computed, provided)) {
    throw new Error("Invalid Dropbox signature");
  }
}

// Dropbox webhook registration verifies the endpoint via GET ?challenge=...
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get("challenge");

  if (!challenge) {
    return NextResponse.json({ error: "Missing challenge" }, { status: 400 });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  if (!process.env.DROPBOX_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "DROPBOX_ACCESS_TOKEN is not set" },
      { status: 401 },
    );
  }

  // If configured, validate webhook signature so only Dropbox can trigger sync.
  // (Dropbox signs the raw POST body with HMAC-SHA256 using the app secret.)
  const signatureHeader = request.headers.get("x-dropbox-signature");
  if (signatureHeader) {
    try {
      const rawBody = await request.text();
      verifyDropboxSignatureOrThrow(rawBody, signatureHeader);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signature verification failed";
      return NextResponse.json({ error: message }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const folderPath = searchParams.get("path") ?? getDropboxFolderPath();
  const limit = Math.max(0, Number(searchParams.get("limit") ?? "0"));
  const onlyNew = (searchParams.get("onlyNew") ?? "true") !== "false";
  const deleteMissing = (searchParams.get("deleteMissing") ?? "true") !== "false";

  try {
    const payload = await getPayload({ config });

    const folder = await listDropboxFolder(folderPath);
    const imageFiles = folder.entries.filter(assertFileMetadata).filter((entry) => {
      return isImageFile(entry.name);
    });
    const candidates = limit > 0 ? imageFiles.slice(0, limit) : imageFiles;
    const imagePathLowersInFolder = new Set(
      imageFiles.map((e) => e.path_lower).filter((p): p is string => Boolean(p)),
    );

    const summary: Array<{
      pathLower: string | null;
      name: string;
      status: "skipped" | "created" | "updated" | "deleted" | "error";
      postId?: string;
      mediaId?: string;
      reason?: string;
    }> = [];

    for (const entry of candidates) {
      const pathLower = entry.path_lower ?? null;
      const name = entry.name;

      if (!pathLower) {
        summary.push({
          pathLower,
          name,
          status: "error",
          reason: "Dropbox entry missing path_lower",
        });
        continue;
      }

      const existing = await findExistingByDropboxPathLower(payload, pathLower);
      if (existing && onlyNew) {
        summary.push({
          pathLower,
          name,
          status: "skipped",
          postId: String(existing.id),
          reason: "Already exists",
        });
        continue;
      }

      try {
        const fileBuffer = await downloadDropboxFile(pathLower);
        const titleBase = stripExtension(name);
        const media = await uploadImageToMedia(payload, fileBuffer, name, titleBase);

        if (existing) {
          const updated = await payload.update({
            collection: "posts",
            id: existing.id,
            data: {
              title: titleBase,
              image: media.id,
              dropbox: {
                pathLower,
                id: entry.id ?? null,
                rev: entry.rev ?? null,
              },
            },
            overrideAccess: true,
          });

          summary.push({
            pathLower,
            name,
            status: "updated",
            postId: String(updated.id),
            mediaId: String(media.id),
          });
          continue;
        }

        const baseSlug = slugify(titleBase);
        const slug = await getUniqueSlug(payload, baseSlug);

        const created = await payload.create({
          collection: "posts",
          data: {
            title: titleBase,
            slug,
            image: media.id,
            dropbox: {
              pathLower,
              id: entry.id ?? null,
              rev: entry.rev ?? null,
            },
          },
          overrideAccess: true,
        });

        summary.push({
          pathLower,
          name,
          status: "created",
          postId: String(created.id),
          mediaId: String(media.id),
        });
      } catch (error) {
        if (existing && isDropboxNotFoundError(error)) {
          await deletePostById(payload, String(existing.id));
          summary.push({
            pathLower,
            name,
            status: "deleted",
            postId: String(existing.id),
            reason: "File missing in Dropbox; deleted corresponding post",
          });
          continue;
        }

        const message = error instanceof Error ? error.message : "Failed to sync file";
        summary.push({
          pathLower,
          name,
          status: "error",
          reason: message,
        });
      }
    }

    if (deleteMissing && limit === 0) {
      const folderPathLower = folderPath.toLowerCase();
      const allDropboxPosts = await listAllDropboxPosts(payload);
      const deleteCandidates = allDropboxPosts.filter((post) => {
        const pathLower = post.dropbox?.pathLower ?? null;
        if (!pathLower) return false;
        if (!pathLower.startsWith(folderPathLower)) return false;
        return !imagePathLowersInFolder.has(pathLower);
      });

      for (const post of deleteCandidates) {
        const pathLower = post.dropbox?.pathLower ?? null;
        await deletePostById(payload, String(post.id));
        summary.push({
          pathLower,
          name: "(missing from folder)",
          status: "deleted",
          postId: String(post.id),
          reason: "Not present in Dropbox folder listing; deleted corresponding post",
        });
      }
    }

    const skippedNonImages = folder.entries
      .filter(assertFileMetadata)
      .filter((entry) => !isImageFile(entry.name)).length;

    return NextResponse.json({
      folderPath,
      totalImagesInFolder: imageFiles.length,
      skippedNonImages,
      processed: candidates.length,
      results: summary,
    });
  } catch (error) {
    if (error instanceof DropboxResponseError) {
      return NextResponse.json(
        { error: error.error, status: error.status },
        { status: error.status },
      );
    }

    const message = error instanceof Error ? error.message : "Failed to sync Dropbox content";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
