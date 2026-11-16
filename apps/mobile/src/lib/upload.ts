import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { api } from "./api";
import type { StoredFile } from "./format";

/**
 * Pictures from the phone to Laravel.
 *
 * The phone only picks and sends. Laravel does the work on what arrives: it checks the
 * contents really are a picture, turns it the right way up, strips where it was taken,
 * shrinks it to the field's image profile and makes the small renditions lists show.
 * So a photo straight off a camera is fine to send, and what comes back is ready to use.
 */

/** A picture chosen on the phone, not yet sent. */
export interface Picked {
  uri: string;
  name: string;
  type: string;
}

/** What Laravel answers to an upload: the key to save in the record, and the file's details. */
export type Uploaded = StoredFile & { key: string };

export class PermissionDenied extends Error {
  constructor(readonly what: "camera" | "photos") {
    super(what === "camera" ? "Allow the camera for this app in your phone's settings to take a photo." : "Allow photos for this app in your phone's settings to choose one.");
    this.name = "PermissionDenied";
  }
}

function describe(asset: ImagePicker.ImagePickerAsset, index: number): Picked {
  const type = asset.mimeType ?? "image/jpeg";
  const extension = type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  return { uri: asset.uri, type, name: asset.fileName ?? `photo-${Date.now()}-${index + 1}.${extension}` };
}

/**
 * Let the person choose pictures from their library, or take one.
 * Resolves to none when they back out.
 *
 * @param from    "library" or "camera".
 * @param options `many` for several at once (library only); `square` to crop to a square, as for a profile picture.
 */
export async function pickImages(from: "library" | "camera", { many = false, square = false }: { many?: boolean; square?: boolean } = {}): Promise<Picked[]> {
  // The camera on a phone always asks. A browser has no camera screen of its own: it offers its file chooser.
  if (from === "camera" && Platform.OS !== "web") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PermissionDenied("camera");
    const taken = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: square, aspect: square ? [1, 1] : undefined, quality: 0.9 });
    return taken.canceled ? [] : taken.assets.map(describe);
  }

  const chosen = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: many && !square,
    selectionLimit: many ? 10 : 1,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    // Laravel resizes and re-encodes; this only keeps a 12-megapixel photo from being 8 MB on the way there.
    quality: 0.9,
  });
  return chosen.canceled ? [] : chosen.assets.map(describe);
}

/** The bytes of a picture on the phone, as the request sends them. */
async function bytesOf(picked: Picked): Promise<Blob> {
  return (await fetch(picked.uri)).blob();
}

/** Send a picture to a resource's file field. Save the answer's `key` in the record. */
export async function uploadTo(resource: string, field: string, picked: Picked): Promise<Uploaded> {
  return api.upload<Uploaded>(`/_nevela/uploads/${encodeURIComponent(resource)}/${encodeURIComponent(field)}`, { body: await bytesOf(picked), type: picked.type }, { name: picked.name });
}

/** Send a picture as the signed-in person's profile picture. Laravel saves it to their account. */
export async function uploadAvatar(picked: Picked): Promise<void> {
  await api.upload("/auth/avatar", { body: await bytesOf(picked), type: picked.type }, { name: picked.name });
}
