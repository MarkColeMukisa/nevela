import Image from "next/image";
import { SOCIAL_ICONS, SocialIcon } from "@/components/social-icons";
import { testimonial } from "@/lib/site-content";
import { cn } from "@/lib/utils";

/**
 * Who the testimonial is from: their photo (or initials), name and role, and the places
 * they can be followed. `inverse` is for a dark panel, such as the mono theme's.
 */
export function TestimonialByline({ inverse = false, align = "left" }: { inverse?: boolean; align?: "left" | "center" }) {
  const { author, role, photo, follow = [] } = testimonial;
  const initials = author
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2);

  return (
    <div className={cn("flex flex-col gap-4", align === "center" && "items-center")}>
      <div className="flex items-center gap-3">
        {photo ? (
          // Beside the name, so it needs no words of its own.
          <Image src={photo} alt="" width={44} height={44} className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-sm font-semibold", inverse ? "bg-background/15 text-background" : "bg-brand/15 text-link")}>
            {initials}
          </span>
        )}
        <span className="flex flex-col text-left text-sm">
          <span className={cn("font-medium", inverse ? "text-background" : "text-foreground")}>{author}</span>
          <span className={inverse ? "text-background/70" : "text-foreground-muted"}>{role}</span>
        </span>
      </div>
      {follow.length > 0 && (
        <ul aria-label={`Follow ${author}`} className="-ml-2 flex flex-wrap items-center gap-0.5">
          {follow.map(({ network, href }) => (
            <li key={network}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={`${author} on ${SOCIAL_ICONS[network].title}`}
                title={SOCIAL_ICONS[network].title}
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-colors",
                  inverse ? "text-background/65 hover:bg-background/10 hover:text-background" : "text-foreground-muted hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <SocialIcon network={network} className="size-4" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
