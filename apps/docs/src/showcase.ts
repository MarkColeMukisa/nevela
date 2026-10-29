import type { ImageMetadata } from "astro";
import kianRover from "./assets/showcase/kian-rover.webp";
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
  /** A screenshot of the site or the dashboard, in src/assets/showcase/. The first letter of its name stands in without one. */
  image?: ImageMetadata;
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
    tagline: "An IT and software company in Kampala",
    description:
      "Kian Rover sets up stock, sales and school systems for small businesses and schools in Uganda, and trains young people to run them through a one-month internship. Its site and staff dashboard are one Nevela app: a five-step project brief that staff quote from the dashboard with a PDF quotation, internship applications with private CVs and an acceptance letter, courses, and a blog.",
    url: "https://kianrover.com",
    status: "live",
    tags: ["Software company", "Business systems", "Internships"],
    uses: ["Public forms", "Actions", "Private files", "Dashboard", "Blog"],
    image: kianRover,
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
