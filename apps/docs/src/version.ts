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
export const RELEASE_HEADLINE = "php nevela dev finds a free port, and php nevela status checks your app";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "php nevela dev runs the API and the dashboard on free ports, and php nevela status tells you what state the app is in.",
  href: "/reference/commands/#neveladev",
  label: "See the commands",
};
