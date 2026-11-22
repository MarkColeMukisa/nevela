import { Appearance, useColorScheme } from "react-native";

import * as storage from "./storage";

/**
 * The app's colours and sizes, in one place. They match the dashboard's default look:
 * near-black on white, and the reverse in the dark. Change them here and every screen follows.
 */
const light = {
  background: "#ffffff",
  surface: "#f6f6f7",
  border: "#e5e5e7",
  text: "#0a0a0a",
  muted: "#6b7280",
  /** Buttons and the active tab. */
  brand: "#0a0a0a",
  onBrand: "#ffffff",
  danger: "#dc2626",
  success: "#16a34a",
  /** Charts, the icons on cards, the active tab: the one colour among the greys. */
  accent: "#4f46e5",
  accentSoft: "#eef2ff",
  tabBar: "#ffffff",
};

const dark: typeof light = {
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
};

export type Colors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;
export const text = { small: 13, body: 16, heading: 20, title: 28 } as const;

/** How the app looks: as the phone does, or always one way. */
export type AppearanceChoice = "system" | "light" | "dark";

const APPEARANCE_KEY = "nevela.appearance";

/** The choice made in Settings, or "system" when none was. */
export async function loadAppearance(): Promise<AppearanceChoice> {
  const kept = await storage.getItem(APPEARANCE_KEY).catch(() => null);
  return kept === "light" || kept === "dark" ? kept : "system";
}

/** Apply a choice now and keep it for the next launch. Every screen follows, since each reads the colour scheme. */
export async function setAppearance(choice: AppearanceChoice): Promise<void> {
  // "unspecified" hands the decision back to the phone. A browser has no way to be told: the
  // web version follows the computer's own setting, and calling it there crashed the app.
  if (typeof Appearance.setColorScheme === "function") Appearance.setColorScheme(choice === "system" ? "unspecified" : choice);
  if (choice === "system") await storage.removeItem(APPEARANCE_KEY).catch(() => undefined);
  else await storage.setItem(APPEARANCE_KEY, choice).catch(() => undefined);
}

/** The colours for the phone's current appearance. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
