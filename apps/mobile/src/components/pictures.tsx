import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { messageOf } from "@/lib/api";
import type { StoredFile } from "@/lib/format";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { pickImages, uploadTo, type Picked, type Uploaded } from "@/lib/upload";

/**
 * Pictures: showing the ones Laravel has, and adding more from the phone.
 *
 * Laravel keeps each picture in several sizes (its image profile's renditions). A list
 * asks for the small one and a record's page for the middle one, so a screen never pulls
 * down a full photograph to draw a thumbnail. What has been shown once is kept on the
 * phone, so scrolling back costs nothing.
 */

/** The address of a picture at about the size wanted: "thumb" for a row, "card" for a page. */
export function pictureUrl(file: StoredFile | null | undefined, size: "thumb" | "card" = "thumb"): string | null {
  if (!file || !file.mime?.startsWith("image/")) return null;
  const renditions = file.renditions ?? {};
  const order = size === "thumb" ? ["thumb", "card"] : ["card", "thumb"];
  // The whole picture is the last resort for a row, and the fallback for a page.
  return order.map((name) => renditions[name]?.url).find(Boolean) ?? file.url;
}

export function Picture({ file, size = 44, shape = "square", rendition }: { file: StoredFile | null | undefined; size?: number; shape?: "square" | "round"; rendition?: "thumb" | "card" }) {
  const colors = useColors();
  const uri = pictureUrl(file, rendition ?? (size > 96 ? "card" : "thumb"));
  const frame = { width: size, height: size, borderRadius: shape === "round" ? size / 2 : size > 96 ? radius.md : radius.sm, backgroundColor: colors.surface };
  if (!uri) return <View style={frame} />;
  return <Image source={{ uri }} style={frame} contentFit="cover" cachePolicy="memory-disk" transition={150} recyclingKey={uri} accessibilityLabel={file?.name} />;
}

/** Two ways to add a picture: the camera, or the phone's library. */
export function AddPicture({ label = "Add a picture", many = false, square = false, busy = false, onPicked, onError }: { label?: string; many?: boolean; square?: boolean; busy?: boolean; onPicked: (picked: Picked[]) => void; onError: (error: unknown) => void }) {
  const choose = async (from: "library" | "camera") => {
    try {
      const picked = await pickImages(from, { many, square });
      if (picked.length > 0) onPicked(picked);
    } catch (caught) {
      onError(caught);
    }
  };
  return (
    <View style={styles.add}>
      <View style={styles.half}><Button variant="secondary" icon="images-outline" label={label} busy={busy} onPress={() => choose("library")} /></View>
      <View style={styles.half}><Button variant="secondary" icon="camera-outline" label="Camera" disabled={busy} onPress={() => choose("camera")} /></View>
    </View>
  );
}

/**
 * A file field that takes pictures, in a form: what it holds now, each removable, and
 * adding more. A picture is sent as soon as it is chosen; the form saves only its key.
 */
export function PictureField({ label, resource, name, many, value, known, problem, onChange }: { label: string; resource: string; name: string; many: boolean; value: string | string[] | null; known: Record<string, StoredFile>; problem?: string; onChange: (value: string | string[] | null) => void }) {
  const colors = useColors();
  const [sent, setSent] = useState<Record<string, Uploaded>>({});
  const [sending, setSending] = useState(0);
  const [error, setError] = useState<unknown>(null);

  const keys = Array.isArray(value) ? value : value ? [value] : [];

  const add = async (picked: Picked[]) => {
    setError(null);
    setSending(picked.length);
    const added: string[] = [];
    try {
      for (const picture of many ? picked : picked.slice(0, 1)) {
        const uploaded = await uploadTo(resource, name, picture);
        setSent((current) => ({ ...current, [uploaded.key]: uploaded }));
        added.push(uploaded.key);
        setSending((left) => left - 1);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(0);
      // What did go up is kept, even if a later one failed.
      if (added.length > 0) onChange(many ? [...keys, ...added] : added[0]);
    }
  };

  const remove = (key: string) => onChange(many ? keys.filter((kept) => kept !== key) : null);

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
      {keys.length > 0 || sending > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {keys.map((key) => (
            <View key={key}>
              <Picture file={sent[key] ?? known[key]} size={88} />
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${(sent[key] ?? known[key])?.name ?? "picture"}`} hitSlop={8} onPress={() => remove(key)} style={[styles.remove, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Ionicons name="close" size={14} color={colors.text} />
              </Pressable>
            </View>
          ))}
          {sending > 0 ? <View style={[styles.sending, { backgroundColor: colors.surface }]}><ActivityIndicator color={colors.muted} /></View> : null}
        </ScrollView>
      ) : null}
      {many || keys.length === 0 ? <AddPicture many={many} label="Library" busy={sending > 0} onPicked={add} onError={setError} /> : null}
      {error ? <Text style={{ color: colors.danger, fontSize: text.small }}>{messageOf(error)}</Text> : null}
      {problem ? <Text style={{ color: colors.danger, fontSize: text.small }}>{problem}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  add: { flexDirection: "row", gap: spacing.sm },
  half: { flex: 1 },
  remove: { position: "absolute", top: 4, right: 4, width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sending: { width: 88, height: 88, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
