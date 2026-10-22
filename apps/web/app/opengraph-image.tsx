import { ImageResponse } from "next/og";
import { brand, initial } from "@/lib/seo";
import { site } from "@/lib/site";

/**
 * The picture a shared link shows, on WhatsApp, X, LinkedIn and the rest: the site's name
 * and tagline on its brand colour, drawn from lib/site.ts. For a designed one, put your
 * own image at app/opengraph-image.png and delete this file and app/twitter-image.tsx.
 */
export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: brand.brand, color: brand.on }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 44 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 80, height: 80, borderRadius: 20, background: brand.on, color: brand.brand, fontSize: 48 }}>{initial}</div>
          {site.name}
        </div>
        <div style={{ display: "flex", fontSize: 76, lineHeight: 1.1, letterSpacing: -2, maxWidth: 1000 }}>{site.tagline}</div>
      </div>
    ),
    size,
  );
}
