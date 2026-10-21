import { site } from "@/lib/site";

/*
 * What the pages read from lib/site.ts, in any of its shapes. site.ts is the app's own, so
 * `nevela upgrade` keeps it as it is, and one from before 0.14 has customers as plain names
 * and no Docs link. The pages read those through here, and work with both.
 */


/** The home page's logo strip: a name, and a link where there is one. */
export const customers = (site.customers as readonly (string | { name: string; href?: string })[]).map((customer) =>
  typeof customer === "string" ? { name: customer } : customer,
);

/** Where the home page's "Docs" points. */
export const docsUrl = (site.links as { docs?: string }).docs ?? "https://nevela-docs.vercel.app";
