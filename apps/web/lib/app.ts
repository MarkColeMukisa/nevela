/**
 * Which of a project's web apps this is.
 *
 * - "site": the public site and the customer area, in a project with the triple tier.
 * - "admin": the staff's app, beside the site. Customers who sign in here are kept to their own account.
 * - "" (none): one app doing both, as every app did before the triple tier.
 *
 * Written by `nevela new` into this app's .nevela.json, which is committed, and read by
 * next.config.ts at build time, so it is the same on every server the app is deployed to.
 */
export type App = "site" | "admin" | "";

export const APP: App = process.env.NEVELA_APP === "site" || process.env.NEVELA_APP === "admin" ? process.env.NEVELA_APP : "";

/** Where someone goes once signed in: the customer area on the site, the dashboard anywhere else. */
export const HOME = APP === "site" ? "/account" : "/dashboard";

/** Their own account's pages. */
export const ACCOUNT = APP === "site" ? "/account" : "/dashboard/account";

/**
 * The cookies a sign-in is kept in. The admin's have names of their own: on localhost the
 * site and the admin differ only by port, and cookies are kept by host, so with the same
 * names signing in to one would sign the other out. In production each app is on its own
 * host anyway, and its cookies never reach the other.
 */
export const COOKIE_PREFIX = APP === "admin" ? "nevela_admin" : "nevela";

/** The page a request is for, as proxy.ts passes it on to layouts, which can't read it themselves. */
export const PATH_HEADER = "x-nevela-path";

/**
 * Where a link Laravel stored leads on the site, which has no dashboard. Notices, pushes and
 * an app's own code all write dashboard addresses ("/dashboard/orders/7"); the site reads them
 * as its customer area's:
 *
 *   /dashboard/account/security → /account/security
 *   /dashboard/orders/7         → /account/records/orders/7
 *   /dashboard/orders, …        → /account
 *
 * Anything that isn't a dashboard address is left as it is. Pure, so it can be tested on its own.
 */
export function onSite(url: string): string {
  const [path, rest = ""] = url.split(/(?=[?#])/, 2);
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return url;
  if (path === "/dashboard/account" || path.startsWith("/dashboard/account/")) return path.replace("/dashboard/account", "/account") + rest;
  const record = /^\/dashboard\/([a-z0-9-]+)\/([^/]+)$/.exec(path);
  if (record && record[1] !== "access" && record[1] !== "trash" && record[2] !== "new") return `/account/records/${record[1]}/${record[2]}`;
  return "/account";
}
