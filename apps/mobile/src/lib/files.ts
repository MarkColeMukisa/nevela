import * as WebBrowser from "expo-web-browser";

import { api, API_URL } from "./api";
import type { StoredFile } from "./format";

/** Where the API is, without its prefix: what a path the API hands back is put after. */
export function apiOrigin(url: string = API_URL): string {
  return url.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i)?.[0] ?? url;
}

/**
 * Open a record's file in the phone's browser, which shows a PDF or a picture and offers
 * to save anything else.
 *
 * A public file opens at its own address. A private one needs the app's token, which a
 * browser can't send, so the API is asked for a link that works for a few minutes, made
 * only for someone who may view the record.
 */
export async function openFile(slug: string, id: string, field: string, file: StoredFile & { private?: boolean }): Promise<void> {
  let url = file.url;
  if (file.private) {
    const link = await api.post<{ path: string }>(`/_nevela/private/${encodeURIComponent(slug)}/${encodeURIComponent(id)}/${encodeURIComponent(field)}/link`);
    url = `${apiOrigin()}${link.path}`;
  }
  await WebBrowser.openBrowserAsync(url);
}
