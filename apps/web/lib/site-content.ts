import type { SocialNetwork } from "@/components/social-icons";
import { site } from "@/lib/site";

/*
 * What the pages read from lib/site.ts, in any of its shapes. site.ts is the app's own, so
 * `nevela upgrade` keeps it as it is, and one from before 0.14 has customers as plain names
 * and a testimonial with no photo or links. The pages read it through here, and work with both.
 */

export interface Testimonial {
  quote: string;
  author: string;
  role: string;
  /** A file under public/. None: the author's initials. */
  photo?: string | null;
  /** Where the author can be followed, each shown as that network's icon. */
  follow?: { network: SocialNetwork; href: string }[];
}

export const testimonial = site.testimonial as Testimonial;

/** The home page's logo strip: a name, and a link where there is one. */
export const customers = (site.customers as readonly (string | { name: string; href?: string })[]).map((customer) =>
  typeof customer === "string" ? { name: customer } : customer,
);

/** Where the home page's "Docs" points. */
export const docsUrl = (site.links as { docs?: string }).docs ?? "https://nevela-docs.vercel.app";
