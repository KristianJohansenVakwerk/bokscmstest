import { DropboxResponseError } from "dropbox";
import { NextResponse } from "next/server";

import { getDropboxClient } from "@/lib/dropbox";
import { bufferFromDropboxDownloadResult } from "@/lib/dropbox-image";

export async function GET(request: Request) {
  if (!process.env.DROPBOX_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "DROPBOX_ACCESS_TOKEN is not set" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");

  if (!path) {
    return NextResponse.json(
      { error: "Missing required query param: path" },
      { status: 400 },
    );
  }

  try {
    const dbx = getDropboxClient();
    const { result } = await dbx.filesDownload({ path });

    const fileBuffer = await bufferFromDropboxDownloadResult(result);
    const content = fileBuffer.toString("utf8");

    let json: unknown = null;
    if (content) {
      try {
        json = JSON.parse(content);
      } catch {
        json = null;
      }
    }

    return NextResponse.json({
      path,
      name: (result as unknown as { name?: string }).name ?? null,
      size: (result as unknown as { size?: number }).size ?? null,
      content,
      json,
    });
  } catch (error) {
    if (error instanceof DropboxResponseError) {
      return NextResponse.json(
        { error: error.error, status: error.status, path },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to download Dropbox file";
    return NextResponse.json({ error: message, path }, { status: 500 });
  }
}

