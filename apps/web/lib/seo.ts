import { site } from "@/lib/site";
import { activeTheme, type ThemeName } from "@/lib/theme";

/**
 * What search engines and shared links are told about the site, in one place.
 *
 * `NEXT_PUBLIC_SITE_URL` is the address people reach the site at, set where it is
 * deployed. Canonical links, the share image and the sitemap are made from it. It is
 * built in, so redeploy after changing it.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

/**
 * Each theme's brand colour and the colour of text on it, for the share image and the
 * icon, which are drawn where the stylesheet doesn't reach. The same values as
 * `--brand` and `--brand-foreground` in app/globals.css; mono's are its foreground and background.
 */
const COLOURS: Record<ThemeName, { brand: string; on: string }> = {
  default: { brand: "#5b5bd6", on: "#ffffff" },
  coral: { brand: "#e31c5f", on: "#ffffff" },
  amber: { brand: "#ffd814", on: "#0f1111" },
  sky: { brand: "#0051c3", on: "#ffffff" },
  mono: { brand: "#0a0a0a", on: "#ffffff" },
  emerald: { brand: "#3ecf8e", on: "#0f1f17" },
};

export const brand = COLOURS[activeTheme];

/** The site's first letter, as the brand mark shows it. */
export const initial = site.name.trim().charAt(0).toUpperCase() || "N";

/** For pages that are no use in search results: signing in, and everything behind it. */
export const noIndex = { index: false, follow: false } as const;

/**
 * Structured data for a page (schema.org, as JSON-LD), for
 * `<script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(…)} />`.
 * A `<` in a title can't end the script early.
 */
export function jsonLd(data: Record<string, unknown>): { __html: string } {
  return { __html: JSON.stringify(data).replace(/</g, "\\u003c") };
}
