// Rich text: a text field whose value is HTML, written in an editor.
//
// Laravel is what makes it safe. Whatever a form, a script or a file sends is cleaned
// there against a list of tags (config/nevela.php, rich_text) before it is stored, and
// again when it is read, so the HTML that reaches this app is HTML that may be shown.
// Nothing here is a security boundary; tidy() below only keeps the editor neat.

/** The tags the editor's toolbar makes, which are the ones Laravel keeps by default. */
const KEPT = new Set(["p", "br", "strong", "em", "s", "a", "h2", "h3", "ul", "ol", "li", "blockquote"]);
const SAME_AS: Record<string, string> = { b: "strong", i: "em", strike: "s", del: "s" };
const DROPPED = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "head", "title", "meta", "link"]);

/**
 * Whether a field holds rich text. The generated descriptor says so with `rich: true`
 * on a text field, a key Flare doesn't know and carries along untouched.
 */
export function isRich(def: { kind: string }): boolean {
  return def.kind === "text" && (def as { rich?: boolean }).rich === true;
}

/** The words alone, on one line: what a table cell shows of a rich text value. */
export function richToText(html: string, limit = 0): string {
  const text = html
    .replace(/<(br|\/p|\/h[1-6]|\/li|\/blockquote)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return limit > 0 && text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** Whether there is anything in it to read. An editor that was opened and left holds `<p><br></p>`. */
export function isBlankHtml(html: string): boolean {
  return richToText(html) === "";
}

/**
 * What was pasted, with only what the toolbar could have made: a page copied from a
 * word processor arrives with fonts, colours and spans that would be stripped on save
 * anyway, and look wrong until then. Browser only.
 */
export function tidyHtml(html: string): string {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const write = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const element = node as Element;
    const raw = element.tagName.toLowerCase();
    const tag = SAME_AS[raw] ?? raw;
    if (DROPPED.has(tag)) return "";
    const inner = Array.from(element.childNodes).map(write).join("");
    if (!KEPT.has(tag)) return inner;
    if (tag === "br") return "<br>";
    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      return /^(https?:|mailto:|\/|#)/i.test(href.trim()) ? `<a href="${escape(href.trim()).replace(/"/g, "&quot;")}">${inner}</a>` : inner;
    }
    return `<${tag}>${inner}</${tag}>`;
  };
  return Array.from(body.childNodes).map(write).join("");
}

/** An address as it was typed, made into one a link can have. Empty when it can't be one. */
export function linkAddress(typed: string): string {
  const address = typed.trim();
  if (address === "") return "";
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(address)) return address;
  // Any other scheme (javascript:, data:) is not somewhere a link goes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(address) && !/^[^/:]+:\d/.test(address)) return "";
  if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(address)) return `mailto:${address}`;
  return `https://${address}`;
}
