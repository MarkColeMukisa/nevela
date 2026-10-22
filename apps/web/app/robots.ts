import type { MetadataRoute } from "next";
import { siteLinks } from "@/lib/extras";
import { siteUrl } from "@/lib/seo";

/**
 * robots.txt. Search engines may read the site, and not the dashboard or the API, except
 * its stored files: a blog post's picture is one, and link previews fetch it.
 *
 * The sign-in pages stay readable on purpose. Each says noindex itself, and a page closed
 * off here can still be listed, from links to it, because its noindex is never read.
 *
 * The sitemap is the blog's (`nevela blog` writes app/sitemap.ts), so it is named when there is one.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/api/_nevela/files/"], disallow: ["/dashboard", "/api/"] }],
    ...(siteLinks().length > 0 ? { sitemap: `${siteUrl()}/sitemap.xml` } : {}),
  };
}
