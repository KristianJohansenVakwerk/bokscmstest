import { Dropbox } from "dropbox";

let dropboxClient: Dropbox | null = null;

function getDropboxConfig() {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_APP_KEY;
  const clientSecret = process.env.DROPBOX_APP_SECRET;
  const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
  const refreshToken = process.env.DROPBOX_REFRESH_TOKEN;

  if (!clientId) {
    throw new Error("NEXT_PUBLIC_DROPBOX_APP_KEY is not set");
  }

  if (!clientSecret) {
    throw new Error("DROPBOX_APP_SECRET is not set");
  }

  return {
    clientId,
    clientSecret,
    fetch: globalThis.fetch.bind(globalThis),
    ...(accessToken && { accessToken }),
    ...(refreshToken && { refreshToken }),
  };
}

/** Returns a singleton Dropbox SDK client (server-only). */
export function getDropboxClient(): Dropbox {
  if (!dropboxClient) {
    dropboxClient = new Dropbox(getDropboxConfig());
  }

  return dropboxClient;
}

/** Clears the cached client (e.g. after token refresh). */
export function resetDropboxClient(): void {
  dropboxClient = null;
}
