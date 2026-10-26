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
export const RELEASE_HEADLINE = "The dashboard's bell works, and the sign-in password has an eye";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "The bell tells people what happened behind the scenes: forms sent, new accounts, failed jobs, and what's wrong with the app.",
  href: "/guides/notifications/",
  label: "Notifications",
};
