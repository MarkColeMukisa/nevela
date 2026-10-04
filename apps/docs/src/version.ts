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
export const RELEASE_HEADLINE = "No more hydration errors in the dashboard, on a patched Next.js";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "the dashboard no longer reports hydration errors, and moves to Next.js 16.3.8, a patched version. Run nevela update to get it.",
  href: "/guides/updating/",
  label: "How to update",
};
