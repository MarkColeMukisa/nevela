import root from "../../../package.json";

/** The Nevela release these docs describe: the repository's version, read at build time. */
export const NEVELA_VERSION: string = root.version;
export const REPO_URL = "https://github.com/MarkColeMukisa/nevela";
/** The changelog rather than a release page: it exists before the first tag does. */
export const RELEASE_URL = "/reference/changelog/";

/**
 * What this release is about, in a few words.
 *
 * Kept here rather than in the pages so there is one line to change per release, and so
 * the version beside it can never disagree with the version in package.json. Both the
 * hero pill and the site banner read it.
 */
export const RELEASE_HEADLINE = "SEO for every app: robots.txt, share images, icons and noindex";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "A shared link now shows a card with your site's name, browsers get an icon, and sign-in pages stay out of search results.",
  href: "/guides/web-app/#search-engines-and-shared-links",
  label: "SEO",
};
