import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { IconName } from "@/components/ui";
import { ACTION_VERBS, describe, opensRecord, type Activity, type ActivityAction } from "@/lib/activity";
import { spacing, text, useColors } from "@/lib/theme";
import { ago } from "@/lib/when";

const ICONS: Record<ActivityAction, IconName> = {
  created: "add-circle-outline",
  updated: "create-outline",
  deleted: "trash-outline",
  restored: "refresh-outline",
  purged: "close-circle-outline",
};

/** One line of the activity log: who did what, to what, and when. A change to a record that is still there opens it. */
export function ActivityRow({ entry, you, last }: { entry: Activity; you: string; last: boolean }) {
  const colors = useColors();
  const { who, what } = describe(entry, you);
  const action = ACTION_VERBS[entry.action] ?? ACTION_VERBS.updated;

  const row = (
    <View style={[styles.activity, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={ICONS[entry.action] ?? ICONS.updated} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: text.small + 1 }}>
          <Text style={{ fontWeight: "600" }}>{who}</Text> {action} <Text style={{ fontWeight: "600" }}>{what}</Text>
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.label} · {ago(entry.at)}</Text>
      </View>
    </View>
  );
  if (!opensRecord(entry)) return row;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/r/[slug]/[id]", params: { slug: entry.slug, id: entry.recordId as string } })} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  activity: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
