import { Pressable, StyleSheet, Text } from "react-native";

import { radius, spacing, text, useColors } from "@/lib/theme";

/** A pill that is on or off: a role someone holds, an action a role allows. */
export function Choice({ label, on, onPress, disabled = false }: { label: string; on: boolean; onPress: () => void; disabled?: boolean }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.choice, { backgroundColor: on ? colors.brand : colors.surface, borderColor: on ? colors.brand : colors.border }, disabled && { opacity: 0.45 }]}>
      <Text style={{ color: on ? colors.onBrand : colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: { minHeight: 38, paddingHorizontal: spacing.lg, borderRadius: radius.lg + 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
