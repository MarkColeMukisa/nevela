// Reading a URL, without fetch().
//
// On Windows, a process that exits just after a fetch() has finished trips an assertion
// inside Node ("UV_HANDLE_CLOSING") and prints a crash where the error message should be.
// The installer asks npm for the latest version first thing, so every mistake it reports
// straight afterwards ended that way: no app name, a name it can't use, a folder that
// already exists. A plain https request on a connection that closes with the answer doesn't.

import https from 'node:https';

/**
 * GET `url`. Resolves to { ok, status, body } with the body as a Buffer, or to null when
 * the server couldn't be reached within `milliseconds`. Never rejects.
 *
 * The time allowed is for the whole exchange, redirects included, and not only for a
 * silence on the line.
 */
export function get(url, milliseconds, redirects = 3, deadline = Date.now() + milliseconds) {
  return new Promise((resolve) => {
    let timer = null;
    const settle = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      const request = https.get(url, { agent: false, headers: { connection: 'close', 'user-agent': 'create-nevela' } }, (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location && redirects > 0) {
          response.resume();
          settle(get(new URL(response.headers.location, url).href, milliseconds, redirects - 1, deadline));
          return;
        }
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => settle({ ok: status >= 200 && status < 300, status, body: Buffer.concat(chunks) }));
        response.on('error', () => settle(null));
      });
      request.on('error', () => settle(null));
      timer = setTimeout(() => request.destroy(new Error('timed out')), Math.max(0, deadline - Date.now()));
    } catch {
      settle(null);
    }
  });
}

/** GET `url` and read it as JSON. Null when it couldn't be reached, or isn't JSON, or isn't a 2xx. */
export async function getJson(url, milliseconds) {
  const response = await get(url, milliseconds);
  if (!response?.ok) return null;
  try {
    return JSON.parse(response.body.toString('utf8'));
  } catch {
    return null;
  }
}
