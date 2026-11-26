/**
 * Where a link from the bell or a push leads in the app. The API's links are the dashboard's
 * ("/dashboard/orders/abc"); the app has a screen for a record's page, and none for the
 * dashboard's own pages (account, access), which the bell opens instead.
 */
/** The dashboard pages the app has a screen of its own for: a security warning opens the block list. */
const PAGES: Record<string, "/access/blocked"> = { "/dashboard/access/blocked": "/access/blocked" };

/** The app's screen for one of the dashboard's own pages, or null. */
export function pageFor(url: string | null): "/access/blocked" | null {
  return PAGES[(url ?? "").replace(/[?#].*$/, "")] ?? null;
}

export function screenFor(url: string | null): { slug: string; id: string } | null {
  const match = /^\/dashboard\/([a-z0-9-]+)\/([^/?#]+)$/.exec(url ?? "");
  return match && match[1] !== "account" && match[1] !== "access" ? { slug: match[1], id: decodeURIComponent(match[2]) } : null;
}
