/**
 * Stored files, as the browser asks for them.
 *
 * A record's file field holds a key such as `products/image/2026/10/<uuid>-kettle.webp`.
 * An image's smaller renditions sit beside it with their name before the extension
 * (`…-kettle.thumb.webp`), so the address of a thumbnail is worked out from the key with
 * no lookup. Which renditions exist is set by the field's profile in the Laravel app's
 * config/nevela.php; asking for one that was never made gets the image itself.
 */

/** Keys that are worth showing rather than naming. */
export const isImageKey = (key: string) => /\.(png|jpe?g|gif|webp|avif)$/i.test(key);

/** The address of a stored file, or of one of its renditions ("thumb", "card", …). */
export function fileUrl(key: string, rendition?: string): string {
  const path = rendition && isImageKey(key) ? key.replace(/(\.[A-Za-z0-9]+)$/, `.${rendition}$1`) : key;
  return `/api/_nevela/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** "products/image/2026/10/<uuid>-kettle.webp" → "kettle.webp" */
export const fileName = (key: string) => key.slice(key.lastIndexOf("/") + 1).replace(/^[0-9a-f-]{36}-/, "");
