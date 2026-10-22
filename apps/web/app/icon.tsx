import { ImageResponse } from "next/og";
import { brand, initial } from "@/lib/seo";

/**
 * The browser tab's icon: the site's first letter on its brand colour, like the brand mark.
 * For your own, put a file at app/icon.png (or app/favicon.ico) and delete this one.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, background: brand.brand, color: brand.on, fontSize: 22 }}>
        {initial}
      </div>
    ),
    size,
  );
}
