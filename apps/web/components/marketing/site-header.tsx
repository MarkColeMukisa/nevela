import Link from "next/link";
import { BrandMark } from "@/components/auth/auth-shell";
import { siteLinks } from "@/lib/extras";
import { site } from "@/lib/site";
import { docsUrl } from "@/lib/site-content";

/** The public site's top bar. Static on purpose: it doesn't read the session, so the home page can be cached. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold">
          <BrandMark link={false} className="[&_span_span]:size-8 [&_span_span]:text-base" />
          {site.name}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-sm text-foreground-muted md:flex">
          <a href="/#features" className="hover:text-foreground">
            Features
          </a>
          <a href="/#customers" className="hover:text-foreground">
            Customers
          </a>
          {/* What the app's resources have put on the site: a blog, when `nevela blog` has made one. */}
          {siteLinks().map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-foreground">
              {link.label}
            </Link>
          ))}
          <a href={docsUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
            Docs
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/sign-in" className="rounded-[var(--button-radius)] px-3 py-2 text-sm font-medium text-foreground-muted hover:text-foreground">
            Log in
          </Link>
          <Link
            href="/sign-in"
            className="rounded-[var(--button-radius)] bg-brand px-4 py-2 text-sm font-medium text-brand-foreground [background-image:var(--brand-gradient,none)] hover:brightness-95"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
