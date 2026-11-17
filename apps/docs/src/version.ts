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
export const RELEASE_HEADLINE = "A shop on the phone, and people and roles to run it";

/** The banner across the top of every page. Points at what the release added. */
export const RELEASE_BANNER = {
  text: "New: customers get a shop in the mobile app, each sees only their own orders, and an administrator manages people and roles from the phone. Build it in the new drinks-app tutorial.",
  href: "/tutorials/juice-me/",
  label: "A drinks app on the phone",
};
