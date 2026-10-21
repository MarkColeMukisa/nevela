import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Who the testimonial is from: their name, and under it, fainter, their role. `inverse` is for a dark panel, such as the mono theme's. */
export function TestimonialByline({ inverse = false, align = "left" }: { inverse?: boolean; align?: "left" | "center" }) {
  return (
    <span className={cn("flex flex-col gap-0.5 text-sm", align === "center" && "items-center text-center")}>
      <span className={cn("font-semibold", inverse ? "text-background" : "text-foreground")}>{site.testimonial.author}</span>
      <span className={inverse ? "text-background/60" : "text-foreground-muted"}>{site.testimonial.role}</span>
    </span>
  );
}
