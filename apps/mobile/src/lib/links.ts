/**
 * Where a link from the bell or a push leads in the app. The API's links are the dashboard's
 * ("/dashboard/orders/abc"); the app has a screen for a record's page, and none for the
 * dashboard's own pages (account, access), which the bell opens instead.
 */
export function screenFor(url: string | null): { slug: string; id: string } | null {
  const match = /^\/dashboard\/([a-z0-9-]+)\/([^/?#]+)$/.exec(url ?? "");
  return match && match[1] !== "account" && match[1] !== "access" ? { slug: match[1], id: decodeURIComponent(match[2]) } : null;
}
