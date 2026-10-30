// A field of several files: gallery:files(image).
//
// Flare's file is one key, so such a field is its JSON, a list of keys, and the generated
// descriptor says what is in it with `files`. Kept in a file of its own, not added to
// files.ts: an upgrade keeps an app's own copy of a file it changed, and what is new has
// to work beside it.

/** What a field that holds several files takes, ["image"], or undefined for any other field. */
export function filesOf(def: object): string[] | undefined {
  const files = (def as { files?: unknown }).files;
  return Array.isArray(files) ? (files as string[]) : undefined;
}

/** The keys in such a field's value: the list from the API, or the form's JSON of it. */
export function fileKeys(value: unknown): string[] {
  let list = value;
  if (typeof value === "string") {
    try {
      list = value.trim() === "" ? [] : JSON.parse(value);
    } catch {
      list = [];
    }
  }
  return Array.isArray(list) ? list.filter((key): key is string => typeof key === "string" && key !== "") : [];
}
