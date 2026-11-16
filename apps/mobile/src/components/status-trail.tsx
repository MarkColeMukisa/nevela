import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { optionLabel, type FieldSpec } from "@/lib/resources";
import { spacing, text, useColors } from "@/lib/theme";

/**
 * Where something has got to, for a status that goes through stages (Pending, Accepted,
 * Preparing, Ready, Completed): the ones behind it ticked, this one marked, the ones ahead plain.
 * The order of the stages is the order the descriptor lists them.
 */
export function StatusTrail({ field, value }: { field: FieldSpec; value: string }) {
  const colors = useColors();
  const stages = field.options ?? [];
  const at = stages.indexOf(value);
  if (stages.length < 3 || at < 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }}>
      {stages.map((stage, index) => {
        const done = index < at;
        const current = index === at;
        return (
          <View key={stage} accessible accessibilityLabel={`${optionLabel(field, stage)}${current ? ", now" : done ? ", done" : ""}`} style={styles.stage}>
            <View style={[styles.dot, { backgroundColor: current || done ? colors.accent : "transparent", borderColor: current || done ? colors.accent : colors.border }]}>
              {done ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
            </View>
            <Text style={{ color: current ? colors.text : colors.muted, fontSize: text.small, fontWeight: current ? "700" : "500" }}>{optionLabel(field, stage)}</Text>
            {index < stages.length - 1 ? <View style={[styles.bar, { backgroundColor: done ? colors.accent : colors.border }]} /> : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stage: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  bar: { width: 16, height: 2, marginLeft: spacing.xs },
});
