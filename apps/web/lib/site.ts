import type { SocialNetwork } from "@/components/social-icons";
import type { ThemeName } from "./theme";

/**
 * What the site says about itself: the home page, the sign-in screens' side panels and
 * the page titles read from here. Edit freely.
 */
export const site = {
  name: "Nevela",
  tagline: "The fastest way to run your business",
  description: "Nevela keeps your team, your customers and your data in one place, and it's live on the edge in every region.",
  /**
   * The look of the whole app: sign-in screens, dashboard, admin and home page.
   * One of: default, coral, amber, sky, mono, emerald. FLARE_THEME (shell or .env)
   * overrides it when the app is built or run with `flare dev`.
   */
  theme: "mono" as ThemeName,
  /** How the dashboard behaves. */
  dashboard: {
    /**
     * Where a record is created and edited: in a dialog over the list ("modal", the
     * default, which keeps the list, its filters and your place in it), or on its own
     * page ("page", better for long forms).
     */
    forms: "sheet" as "sheet" | "page",
  },
  /** The small pill above the home page headline; set to null to hide it. */
  announcement: null as { label: string; text: string; href: string } | null,
  /** The home page's feature grid (icon names from lucide.dev). */
  features: [
    { icon: "zap", title: "Fast everywhere", description: "Served from the edge in every region, so pages load in milliseconds wherever your customers are." },
    { icon: "shield-check", title: "Secure by default", description: "Passkeys, two-factor sign-in, roles and rate limits, switched on from day one." },
    { icon: "layout-dashboard", title: "One place for your data", description: "Every record your team keeps, with search, filters and an admin built in." },
    { icon: "users", title: "Built for teams", description: "Invite your team, give each person the right access, and see who changed what." },
    { icon: "plug", title: "Connects to your tools", description: "A documented API for every record, ready for your scripts and integrations." },
    { icon: "credit-card", title: "Billing when you need it", description: "Plans, checkout and invoices through Stripe, without building a billing system." },
  ],
  /** The home page's logo strip, with a link where there is one. These are apps built with Nevela: put your own customers here, or empty it to hide the strip. */
  customers: [
    { name: "Kian Rover", href: "https://kianrover.com" },
    { name: "IKIPS", href: "https://ikips.laravel.cloud" },
    { name: "Rotus Imeir" },
  ] as { name: string; href?: string }[],
  /** Shown beside the sign-up form. */
  highlights: [
    "Set up in minutes, with nothing to install",
    "Secure sign-in with passkeys and two-factor",
    "Your data stays yours: export it any time",
  ],
  /**
   * The quote on the home page, and on the sign-in screen of themes with a quote panel.
   * It starts as Nevela's own, from the person who made it: put one of yours here.
   * `photo` is a file under public/ (null shows initials), and `follow` the places its
   * author can be followed, each shown as that network's icon.
   */
  testimonial: {
    quote: "I built Nevela because, every time I started a new application, I found myself wishing the same things were already there. … So I built the framework I kept wishing I had.",
    author: "Mark Cole Mukisa",
    role: "Creator of Nevela",
    photo: "/nevela/mark-cole-mukisa.jpg" as string | null,
    follow: [
      { network: "whatsapp", href: "https://wa.me/256702262806" },
      { network: "x", href: "https://x.com/MarkColeMUKISA" },
      { network: "facebook", href: "https://www.facebook.com/profile.php?id=61578393883785" },
      { network: "instagram", href: "https://www.instagram.com/markcolemukisa/" },
      { network: "linkedin", href: "https://www.linkedin.com/in/mark-cole-mukisa-3247a7334/" },
      { network: "tiktok", href: "https://www.tiktok.com/@markcolemukisa" },
    ] as { network: SocialNetwork; href: string }[],
  },
  links: {
    terms: "/terms",
    privacy: "/privacy",
    support: "mailto:support@example.com",
    /** The home page footer's "Docs". */
    docs: "https://nevela-docs.vercel.app",
  },
};
