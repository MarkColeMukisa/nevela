import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type RefreshControlProps, type TextInputProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { radius, spacing, text, useColors } from "@/lib/theme";

/** The small set of pieces every screen is built from. */

export type IconName = ComponentProps<typeof Ionicons>["name"];

/** A screen's frame: safe areas, scrolling, and room for the keyboard. */
export function Screen({ children, edges = ["top"], refreshControl, centered = false }: { children: ReactNode; edges?: Edge[]; refreshControl?: React.ReactElement<RefreshControlProps>; centered?: boolean }) {
  const colors = useColors();
  return (
    <SafeAreaView edges={edges} style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, centered && styles.centered]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}>
          <View style={styles.column}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{children}</Text>;
}

export function Heading({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text accessibilityRole="header" style={[styles.heading, { color: colors.muted }]}>{children}</Text>;
}

export function Body({ children, muted = false, small = false }: { children: ReactNode; muted?: boolean; small?: boolean }) {
  const colors = useColors();
  return <Text style={{ color: muted ? colors.muted : colors.text, fontSize: small ? text.small : text.body, lineHeight: small ? 18 : 22 }}>{children}</Text>;
}

/** A message about what just happened: a refusal in red, good news in green. */
export function Notice({ children, tone = "danger" }: { children: ReactNode; tone?: "danger" | "success" }) {
  const colors = useColors();
  const colour = tone === "danger" ? colors.danger : colors.success;
  return (
    <View accessibilityRole="alert" style={[styles.notice, { borderColor: colour }]}>
      <Text style={{ color: colour, fontSize: text.small, lineHeight: 18 }}>{children}</Text>
    </View>
  );
}

export function Button({ label, onPress, variant = "primary", busy = false, disabled = false, icon }: { label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger" | "link"; busy?: boolean; disabled?: boolean; icon?: IconName }) {
  const colors = useColors();
  const off = busy || disabled;
  const foreground = variant === "primary" ? colors.onBrand : variant === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        variant === "link" ? styles.link : styles.button,
        variant === "primary" && { backgroundColor: colors.brand },
        (variant === "secondary" || variant === "danger") && { borderWidth: 1, borderColor: variant === "danger" ? colors.danger : colors.border },
        (pressed || off) && { opacity: 0.6 },
      ]}>
      {busy ? <ActivityIndicator color={foreground} /> : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
          <Text style={{ color: foreground, fontSize: variant === "link" ? text.small : text.body, fontWeight: "600" }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A labelled text box, with the server's complaint about it underneath when there is one. */
export function Field({ label, error, ...input }: { label: string; error?: string } & TextInputProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={{ color: colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...input}
        style={[styles.input, { color: colors.text, borderColor: error ? colors.danger : colors.border, backgroundColor: colors.background }]}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: text.small }}>{error}</Text> : null}
    </View>
  );
}

/** A bordered group of rows, as in a settings screen. */
export function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>{children}</View>;
}

/** One line of a card: what it is, its value or detail, and a chevron when it leads somewhere. */
export function Row({ icon, label, detail, value, onPress, danger = false, last = false }: { icon?: IconName; label: string; detail?: string | null; value?: string | null; onPress?: () => void; danger?: boolean; last?: boolean }) {
  const colors = useColors();
  const colour = danger ? colors.danger : colors.text;
  const inner = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {icon ? <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.muted} /> : null}
      <View style={styles.rowText}>
        <Text style={{ color: colour, fontSize: text.body }}>{label}</Text>
        {detail ? <Text style={{ color: colors.muted, fontSize: text.small, lineHeight: 18 }}>{detail}</Text> : null}
      </View>
      {value ? <Text numberOfLines={1} style={[styles.rowValue, { color: colors.muted }]}>{value}</Text> : null}
      {onPress && !danger ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {inner}
    </Pressable>
  );
}

/** A screen that is still fetching what it shows. */
export function Loading() {
  const colors = useColors();
  return (
    <View style={[styles.fill, styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator color={colors.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, padding: spacing.lg, paddingBottom: spacing.xxl },
  centered: { justifyContent: "center", alignItems: "center" },
  // A tablet or a browser window is wider than a form should be.
  column: { width: "100%", maxWidth: 560, alignSelf: "center", gap: spacing.lg },
  title: { fontSize: text.title, fontWeight: "700", letterSpacing: -0.5 },
  heading: { fontSize: text.small, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  link: { minHeight: 44, flexDirection: "row", gap: spacing.xs, alignItems: "center", justifyContent: "center" },
  field: { gap: spacing.xs },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: text.body },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  row: { minHeight: 52, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowText: { flex: 1, gap: 2 },
  rowValue: { maxWidth: "50%", fontSize: text.small },
});
