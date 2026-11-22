// The colours the phone app is drawn in, by theme. One theme ships, "neutral": near-black on
// white, and the reverse in the dark, matching the dashboard's default look. More can be added
// beside it; `theme` below picks the one in use.
//
// The dashboard's own looks are in apps/web/lib/theme.ts for now (Flare's themes); one set of
// tokens for both apps is still to come.

export interface Palette {
  background: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  /** Buttons and the active tab. */
  brand: string;
  onBrand: string;
  danger: string;
  success: string;
  /** Charts, the icons on cards, the active tab: the one colour among the greys. */
  accent: string;
  accentSoft: string;
  tabBar: string;
}

export interface Theme {
  light: Palette;
  dark: Palette;
}

export const themes = {
  neutral: {
    light: {
      background: "#ffffff",
      surface: "#f6f6f7",
      border: "#e5e5e7",
      text: "#0a0a0a",
      muted: "#6b7280",
      brand: "#0a0a0a",
      onBrand: "#ffffff",
      danger: "#dc2626",
      success: "#16a34a",
      accent: "#4f46e5",
      accentSoft: "#eef2ff",
      tabBar: "#ffffff",
    },
    dark: {
      background: "#0a0a0a",
      surface: "#18181b",
      border: "#27272a",
      text: "#fafafa",
      muted: "#9ca3af",
      brand: "#fafafa",
      onBrand: "#0a0a0a",
      danger: "#f87171",
      success: "#4ade80",
      accent: "#818cf8",
      accentSoft: "#1e1b4b",
      tabBar: "#18181b",
    },
  },
} satisfies Record<string, Theme>;

export type ThemeName = keyof typeof themes;

/** The theme the app is drawn in. */
export const theme: ThemeName = "neutral";
