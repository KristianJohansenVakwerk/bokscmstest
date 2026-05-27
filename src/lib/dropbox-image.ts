const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function isImageFile(filename: string): boolean {
  return IMAGE_EXTENSIONS.has(getFileExtension(filename));
}

export function mimeTypeFromFilename(filename: string): string {
  return MIME_BY_EXTENSION[getFileExtension(filename)] ?? "application/octet-stream";
}

/** Dropbox may attach `fileBinary` (Node) or `fileBlob` (bundled/edge runtimes). */
export async function bufferFromDropboxDownloadResult(result: unknown): Promise<Buffer> {
  const file = result as {
    fileBinary?: Buffer | Uint8Array;
    fileBlob?: Blob;
  };

  if (file.fileBinary) {
    return Buffer.isBuffer(file.fileBinary) ? file.fileBinary : Buffer.from(file.fileBinary);
  }

  if (file.fileBlob) {
    const arrayBuffer = await file.fileBlob.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("Dropbox download returned no file data");
}
