import { Appearance, useColorScheme } from "react-native";

import { theme, themes } from "@shared/themes";

import * as storage from "./storage";

/**
 * The app's colours and sizes, in one place. The colours are the theme's, from
 * packages/shared/themes.ts, which the dashboard's look is matched to: change them there and
 * every screen follows.
 */
const { light, dark } = themes[theme];
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
