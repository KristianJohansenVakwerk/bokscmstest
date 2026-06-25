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

/**
 * True when either a long-lived access token is configured, OR the refresh-token
 * trio (app key + app secret + refresh token) is present so the SDK can mint
 * fresh access tokens on demand.
 */
export function hasDropboxAuth(): boolean {
  if (process.env.DROPBOX_ACCESS_TOKEN) return true;
  return Boolean(
    process.env.NEXT_PUBLIC_DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET &&
      process.env.DROPBOX_REFRESH_TOKEN,
  );
}

export const DROPBOX_AUTH_MISSING_MESSAGE =
  "Dropbox auth not configured. Set DROPBOX_REFRESH_TOKEN (plus app key/secret) or DROPBOX_ACCESS_TOKEN.";
