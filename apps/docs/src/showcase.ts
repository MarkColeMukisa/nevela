import { REPO_URL } from "./version";

/**
 * Projects built in Nevela, for the showcase page (src/content/docs/showcase.mdx).
 *
 * To add one, add an entry below and open a pull request, or open a showcase issue and
 * we add it for you: SUBMIT_URL is the form, with every question it needs answered.
 */
export interface ShowcaseProject {
  name: string;
  /** One line, under the name: what it is, in a few words. */
  tagline: string;
  /** A short paragraph: what it does and who it is for. */
  description: string;
  /** Where it can be seen. Leave it out for an app that isn't public. */
  url?: string;
  /** Live, or still being built (or moved) onto Nevela. */
  status: "live" | "building";
  /** What kind of app it is: "E-Commerce", "Education". Two to four. */
  tags: string[];
  /** The parts of Nevela it is built on. */
  uses: string[];
  /** Who made it, with a link to them if they want one. */
  by: { name: string; href?: string };
  /** Shown first, and larger. */
  featured?: boolean;
}

/** The showcase issue form: .github/ISSUE_TEMPLATE/showcase.yml in the repository. */
export const SUBMIT_URL = `${REPO_URL}/issues/new?template=showcase.yml`;

export const projects: ShowcaseProject[] = [
  {
    name: "Kian Rover",
    tagline: "Leadership and mentorship programmes",
    description:
      "Internships, programme registration with mobile-money payments, a newsletter, updates and a blog. Its six existing tables were adopted as Nevela resources as they were, and its contact, newsletter and internship forms are moving to Nevela's protected public forms.",
    url: "https://kianrover.com",
    status: "building",
    tags: ["Education", "Payments", "Public site"],
    uses: ["Adopted tables", "Dashboard", "Public site", "Blog"],
    by: { name: "MarkCole MUKISA", href: "https://x.com/MarkColeMUKISA" },
    featured: true,
  },
];

/** What a submission is asked for, shown on the page so nobody is surprised by the form. */
export const asked = [
  "The project's name, its address, and one line about it",
  "A short description: what it does and who it is for",
  "The Nevela version, and which parts of Nevela it uses",
  "A screenshot of the site or the dashboard",
  "Your name as you want it credited, and a link if you want one",
];
