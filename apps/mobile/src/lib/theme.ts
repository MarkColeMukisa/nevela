import { useColorScheme } from "react-native";

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
};

export type Colors = typeof light;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 14 } as const;
export const text = { small: 13, body: 16, heading: 20, title: 28 } as const;

/** The colours for the phone's current appearance. */
export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
