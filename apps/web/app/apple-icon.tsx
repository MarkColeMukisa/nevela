import { ImageResponse } from "next/og";
import { brand, initial } from "@/lib/seo";

/** The icon a phone shows when the site is added to its home screen. As app/icon.tsx, larger. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: brand.brand, color: brand.on, fontSize: 112 }}>
        {initial}
      </div>
    ),
    size,
  );
}
