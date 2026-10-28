import type { ImageMetadata } from "astro";
import contactsCover from "./assets/tutorials/contacts-cover.png";

/**
 * The tutorials, for the tutorials page (src/content/docs/tutorials/index.mdx). Each one
 * that is out has its page at /tutorials/<slug>/ and its steps in examples/<slug>/, which
 * CI runs in a new app.
 */
export interface Tutorial {
  /** Its address under /tutorials/, and its folder in examples/. */
  slug: string;
  title: string;
  /** Two or three sentences: what you build, and what you learn doing it. */
  summary: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  /** About how long it takes, done rather than read. */
  minutes: number;
  /** What it teaches, in a few words each. */
  topics: string[];
  /** The app it builds, as it looks. Left out until it is written. */
  cover?: ImageMetadata;
  /** The icon a card shows while it has no picture: a Lucide name. */
  icon: "contact" | "shopping-cart" | "graduation-cap";
  /** Written, and on the site. One still being written is shown, without a link. */
  out: boolean;
}

export const tutorials: Tutorial[] = [
  {
    slug: "contacts",
    title: "Contacts: your first app",
    summary:
      "Build a small contacts app from an empty folder: companies and the people at them. Add a field later, give a lead a one-click button, decide who sees what, and call it all over the API.",
    level: "Beginner",
    minutes: 20,
    topics: ["Resources", "Relations", "Migrations", "Actions", "Roles", "API"],
    cover: contactsCover,
    icon: "contact",
    out: true,
  },
  {
    slug: "online-shop",
    title: "An online shop with orders",
    summary:
      "Categories, products with optimised pictures, and orders whose items are edited as a table inside the order, with a total kept up to date. Then a public page for the products.",
    level: "Intermediate",
    minutes: 35,
    topics: ["Images", "Money", "Line items", "Public site"],
    icon: "shopping-cart",
    out: false,
  },
  {
    slug: "student-app",
    title: "A student app",
    summary:
      "Students, courses and the enrolments that join them, teachers who see only their own classes, and a public sign-up form that proves the student's email address.",
    level: "Advanced",
    minutes: 45,
    topics: ["Many-to-many", "Policies", "Public forms", "Notifications"],
    icon: "graduation-cap",
    out: false,
  },
];
