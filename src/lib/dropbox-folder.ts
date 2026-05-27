import type { files } from "dropbox";

import { getDropboxClient } from "@/lib/dropbox";

export function getDropboxFolderPath(): string {
  return process.env.DROPBOX_FOLDER_PATH ?? "";
}

export async function listDropboxFolder(
  path: string = getDropboxFolderPath(),
): Promise<files.ListFolderResult> {
  const dbx = getDropboxClient();
  const response = await dbx.filesListFolder({ path });
  let result = response.result;

  while (result.has_more) {
    const next = await dbx.filesListFolderContinue({ cursor: result.cursor });
    result = {
      ...next.result,
      entries: [...result.entries, ...next.result.entries],
    };
  }

  return result;
}
