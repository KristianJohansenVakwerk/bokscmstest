import { NextResponse } from "next/server";

import { getDropboxClient, hasDropboxAuth } from "@/lib/dropbox";

export async function GET() {
  try {
    const dbx = getDropboxClient();

    if (!hasDropboxAuth()) {
      return NextResponse.json({
        initialized: true,
        authenticated: false,
        message:
          "Dropbox SDK is ready with app credentials. Add DROPBOX_REFRESH_TOKEN (or DROPBOX_ACCESS_TOKEN) to call the API.",
      });
    }

    const { result } = await dbx.usersGetCurrentAccount();

    return NextResponse.json({
      initialized: true,
      authenticated: true,
      account: {
        accountId: result.account_id,
        name: result.name.display_name,
        email: result.email,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize Dropbox";

    return NextResponse.json({ initialized: false, error: message }, { status: 500 });
  }
}
