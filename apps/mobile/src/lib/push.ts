import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { api } from "./api";
import * as storage from "./storage";

/**
 * Push notifications: what reaches the phone while the app is closed. Every bell notice goes
 * out as one (Laravel sends it, through Expo), so "Your order JM-0016 is now Ready" arrives
 * with the app shut.
 *
 * When someone signs in, this phone's Expo push token is given to Laravel (PUT
 * _nevela/push-tokens); when they sign out, it is taken back first, while the sign-in still
 * works. Laravel also forgets it whenever the sign-in ends some other way (revoked from the
 * Devices screen, a new password), so a phone no longer signed in hears nothing more.
 *
 * Nothing happens where there can be no push: the web version, a simulator, and Expo Go on
 * Android, which has had no remote push since SDK 53 (a development or EAS build does). An
 * Android build also needs Firebase set up: see the mobile app guide.
 */

/** Where the token registered for whoever is signed in is kept: an app reopened still knows it, to take it back on signing out. */
const KEY = "nevela.push-token";

/** The channel every push is sent on (Laravel's Push::send says "default"). */
const CHANNEL = "default";

export const pushSupported =
  Platform.OS !== "web" && !(Platform.OS === "android" && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);

/** expo-notifications, loaded only where pushes can work: Expo Go on Android warns as soon as it is used. */
const notifications = () => import("expo-notifications");

let handling = false;

/** How a push arriving with the app open is shown: as a banner, as it would be with the app closed. */
async function handleWhileOpen(): Promise<void> {
  if (handling) return;
  handling = true;
  const Notifications = await notifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Ask for permission (once), and tell Laravel where to reach this phone. Never throws. */
export async function registerPush(): Promise<void> {
  if (!pushSupported || !Device.isDevice) return;
  // The EAS project the build belongs to (`npx eas-cli@latest init` sets it): Expo's address for the
  // phone is per project. Without one, nobody is asked for a permission that could come to nothing.
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    const Notifications = await notifications();
    await handleWhileOpen();
    // Android needs a channel before it asks for permission (Android 13 and later).
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: "Notifications",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    // Kept first: if the answer is lost after Laravel saved it, signing out can still take it back.
    await storage.setItem(KEY, token);
    await api.put("/_nevela/push-tokens", { token, platform: Platform.OS });
  } catch {
    // No Firebase in this build, no permission, or no signal: the bell still works.
  }
}

/** Stop this phone's pushes for whoever is signed in. Call it before the sign-in ends. */
export async function forgetPush(): Promise<void> {
  const token = await storage.getItem(KEY).catch(() => null);
  if (token === null) return;
  await storage.removeItem(KEY).catch(() => undefined);
  try {
    await api.delete(`/_nevela/push-tokens/${encodeURIComponent(token)}`);
  } catch {
    // Offline: Laravel forgets the phone when the sign-in ends anyway.
  }
}

/** What a tapped push is about, as the bell's links say it: "/dashboard/orders/abc". */
export interface PushTap {
  id: string;
  url: string | null;
}

/**
 * Call `onTap` for each push the person taps, and for the one that opened the app. Each once:
 * unless `onTap` answers false (not yet: signed out), so it is followed after signing in.
 * Returns what stops listening.
 */
export async function followTaps(onTap: (tap: PushTap) => boolean | void): Promise<() => void> {
  if (!pushSupported) return () => undefined;
  const Notifications = await notifications();
  const follow = (response: { notification: { request: { identifier: string; content: { data?: Record<string, unknown> | null } } } } | null) => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (followed.has(id)) return;
    const url = response.notification.request.content.data?.url;
    if (onTap({ id, url: typeof url === "string" ? url : null }) === false) return;
    followed.add(id);
    // Else the next launch finds the same push as the one that opened the app, and opens it again.
    Notifications.clearLastNotificationResponse();
  };
  await Notifications.getLastNotificationResponseAsync().then(follow).catch(() => undefined);
  const listening = Notifications.addNotificationResponseReceivedListener(follow);
  return () => listening.remove();
}

/** The pushes already acted on, so the one that opened the app isn't followed twice. */
const followed = new Set<string>();
