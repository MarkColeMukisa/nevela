import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the sign-in is kept between launches.
 *
 * On a phone that is the Keychain (iOS) or the Keystore (Android), which other apps can't
 * read. In a browser (`expo start --web`, for trying the app without a device) there is
 * no such place, so it is localStorage: fine for development, and the reason the web
 * build is not the way to ship this app.
 */
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // A private window may refuse; the sign-in then lasts until the tab closes.
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Nothing was stored.
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
