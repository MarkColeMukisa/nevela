/**
 * Rich text on the phone: a text field whose value is HTML, written in the dashboard's editor.
 *
 * A phone has no editor for it, so it is edited as what it mostly is: paragraphs. A value
 * that is only paragraphs and line breaks becomes plain text to type into, and goes back as
 * paragraphs. One with more (bold, links, headings, lists) is kept as it is, unless the person
 * chooses to edit it as plain text and drop that formatting.
 *
 * Laravel cleans whatever is sent against its list of tags, so nothing here keeps anything safe.
 * Kept free of anything that needs the app running, so it can be tested on its own.
 */

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#039;": "'", "&apos;": "'", "&nbsp;": " " };

function decode(html: string): string {
  return html.replace(/&(amp|lt|gt|quot|#0?39|apos|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Whether HTML holds nothing but paragraphs and line breaks, with no attributes on them. */
export function isPlainRich(html: string): boolean {
  const tags = html.match(/<[^>]*>/g) ?? [];
  return tags.every((tag) => /^<\/?p>$/i.test(tag) || /^<br\s*\/?>$/i.test(tag));
}

/** Rich text as the text a person types: paragraphs apart by a blank line. Formatting is dropped. */
export function richToText(html: string): string {
  return decode(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<\/(p|h[1-6]|li|blockquote)>/gi, "\n\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Typed text as rich text: each part apart by a blank line a paragraph, a single new line a break. */
export function textToRich(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map((part) => `<p>${escape(part).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
