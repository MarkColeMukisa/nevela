// Sending a file to a file field, shared by the field of one (file-field.tsx) and the field
// of several (files-field.tsx). Kept in a file of its own: an upgrade keeps an app's own
// copy of a file it changed, and what is new has to work beside it.

import { matchesContentType, mimeTypesFor, SNIFF_BYTES, sniffMatches } from "@flaredev/core";

const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** "1.9 MB" — with a non-breaking space so a size never wraps apart. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${whole.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${whole.format(bytes / 1024)} KB`;
  const megabytes = bytes / 1024 / 1024;
  return `${(megabytes < 10 ? oneDecimal : whole).format(megabytes)} MB`;
}

/** ["image", "pdf"] → "image or PDF" (acronyms stay upper case). */
export function describeAccept(accept: readonly string[]): string {
  if (accept.includes("any")) return "any file";
  const names = accept.map((category) => (category === "pdf" || category === "csv" ? category.toUpperCase() : category));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0]!;
}

/** "image/png" → "PNG", used when a file's contents don't match its type. */
const typeName = (type: string) => (type.split("/")[1] ?? type).replace(/^vnd\..*\./, "").toUpperCase();

/** What is wrong with a file for a field, before it is sent: its type, its size, its contents. Null when nothing is. */
export async function checkFile(file: File, label: string, accept: readonly string[], maxBytes: number): Promise<string | null> {
  const type = file.type || "application/octet-stream";
  if (!matchesContentType(type, mimeTypesFor(accept as Parameters<typeof mimeTypesFor>[0]))) return `${label} accepts ${describeAccept(accept)} files.`;
  if (file.size > maxBytes) return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`;
  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  if (sniffMatches(type, head) === false) {
    return `${file.name} isn't a valid ${typeName(type)} file. It may have been renamed; choose the original file.`;
  }
  return null;
}

/**
 * PUT with progress events, which fetch() can't report for uploads.
 *
 * Resolves with the key the file was stored under. Laravel chooses it, because an image
 * is optimised on the way in and may come out as a different type from the one sent.
 */
export function put(url: string, file: File, onProgress: (loaded: number) => void, signal: { abort?: () => void }) {
  return new Promise<string | undefined>((resolve, reject) => {
    const request = new XMLHttpRequest();
    signal.abort = () => request.abort();
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      let answer: { error?: string; key?: string } = {};
      try {
        answer = JSON.parse(request.responseText) as typeof answer;
      } catch {
        // Not JSON: the status says what happened.
      }
      if (request.status >= 200 && request.status < 300) return resolve(answer.key);
      reject(new Error(answer.error ?? `Upload failed (${request.status}).`));
    };
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file);
  });
}
