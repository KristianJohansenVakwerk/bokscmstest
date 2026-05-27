import { DropboxResponseError } from "dropbox";
import { NextResponse } from "next/server";

import { getDropboxFolderPath, listDropboxFolder } from "@/lib/dropbox-folder";

export async function GET(request: Request) {
  if (!process.env.DROPBOX_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "DROPBOX_ACCESS_TOKEN is not set" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") ?? getDropboxFolderPath();

  try {
    const result = await listDropboxFolder(path);

    return NextResponse.json({
      path,
      entries: result.entries,
      cursor: result.cursor,
      has_more: result.has_more,
    });
  } catch (error) {
    if (error instanceof DropboxResponseError) {
      return NextResponse.json(
        {
          error: error.error,
          status: error.status,
          path,
        },
        { status: error.status },
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to list Dropbox folder";

    return NextResponse.json({ error: message, path }, { status: 500 });
  }
}
