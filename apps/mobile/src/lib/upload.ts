import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
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
  /** In pixels, when the picker says. */
  width?: number;
  height?: number;
}

/**
 * The longest side a photo is sent at. Laravel shrinks to the field's profile anyway (1600
 * by default), so nothing it keeps is lost; shrinking first keeps a 12-megapixel photo from
 * being several megabytes, over PHP's 2 MB `upload_max_filesize` for a form. A profile of
 * your own larger than this needs MAX_SIDE raised with it.
 */
const MAX_SIDE = 2048;

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
  return { uri: asset.uri, type, name: asset.fileName ?? `photo-${Date.now()}-${index + 1}.${extension}`, width: asset.width, height: asset.height };
}

/** A picture larger than MAX_SIDE, made that size as a JPEG. Anything else, or one that can't be, as it is. */
async function shrunk(picked: Picked): Promise<Picked> {
  const { width = 0, height = 0 } = picked;
  if (Math.max(width, height) <= MAX_SIDE) return picked;
  try {
    const context = ImageManipulator.manipulate(picked.uri);
    context.resize(width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE });
    const saved = await (await context.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return { uri: saved.uri, name: picked.name.replace(/\.[^./]+$/, "") + ".jpg", type: "image/jpeg", width: saved.width, height: saved.height };
  } catch {
    // Sent as it was taken: Laravel shrinks it, if PHP lets it through.
    return picked;
  }
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
    // Laravel resizes and re-encodes; on a phone the photo is also shrunk before it is sent (see shrunk()).
    quality: 0.9,
  });
  return chosen.canceled ? [] : chosen.assets.map(describe);
}

/**
 * Send a picture to an upload address.
 *
 * On a phone, as a form whose "file" part is the picture's place on disk: React Native's
 * networking reads the file itself. Read into JavaScript first (a Blob, an ArrayBuffer),
 * the bytes arrived altered on Android and Laravel refused them as not a picture (#134).
 * In a browser, the file is the request's body, which keeps upload progress working.
 */
async function send<T>(path: string, picked: Picked): Promise<T> {
  if (Platform.OS === "web") {
    return api.upload<T>(path, { body: await (await fetch(picked.uri)).blob(), type: picked.type }, { name: picked.name });
  }
  const photo = await shrunk(picked);
  const form = new FormData();
  form.append("_method", "PUT");
  // React Native's own shape for a file in a form; the DOM's FormData types don't know it.
  form.append("file", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  return api.uploadForm<T>(path, form, { name: photo.name });
}

/** Send a picture to a resource's file field. Save the answer's `key` in the record. */
export async function uploadTo(resource: string, field: string, picked: Picked): Promise<Uploaded> {
  return send<Uploaded>(`/_nevela/uploads/${encodeURIComponent(resource)}/${encodeURIComponent(field)}`, picked);
}

/** Send a picture as the signed-in person's profile picture. Laravel saves it to their account. */
export async function uploadAvatar(picked: Picked): Promise<void> {
  await send("/auth/avatar", picked);
}
