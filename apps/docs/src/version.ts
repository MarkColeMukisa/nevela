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
export const RELEASE_HEADLINE = "What to install first, and the tutorials in every new app's blog";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "New to Nevela? Set up your computer says what to install first, on macOS, Windows and Linux, and every new app's blog now starts with the tutorials.",
  href: "/start/setup/",
  label: "Set up your computer",
};
