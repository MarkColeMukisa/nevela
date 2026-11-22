import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatMoney } from "@/lib/money";
import { radius, spacing, text, useColors } from "@/lib/theme";

/** GET _nevela/shop-figures: the shop at a glance. Only an app with a shop answers it. */
export interface ShopFigures {
  orders: { slug: string; label: string; pluralLabel: string };
  today: { orders: number; sameTimeLastWeek: number };
  /** Orders still in the status an order starts with, or null when orders have no status. */
  pending: number | null;
  pendingStatus: string | null;
  /** The field it is, for a link to the pending ones. */
  statusField: string | null;
  /** Cancelled orders left out; null when orders have no money field. */
  sales: { total: number; week: number; lastWeek: number } | null;
  currency: string | null;
}

/** "+12%" against what it was, or "New" from nothing, or "Same". */
function change(now: number, before: number): { label: string; up: boolean | null } {
  if (now === before) return { label: "Same", up: null };
  if (before === 0) return { label: "New", up: true };
  const percent = Math.round(((now - before) / before) * 100);
  return { label: `${percent > 0 ? "+" : ""}${percent}%`, up: percent > 0 };
}

/**
 * The top of the staff home in a shop: today's orders against the same time last week, what is
 * waiting, and sales this week against last. Business first: this is what an owner opens the app for.
 */
export function ShopFiguresCard({ figures }: { figures: ShopFigures }) {
  const colors = useColors();
  const today = figures.today.orders;
  const before = figures.today.sameTimeLastWeek;
  const versus = before === today ? "the same as this time last week" : `${before.toLocaleString()} by this time last week`;
  const sales = figures.sales;
  const salesChange = sales ? change(sales.week, sales.lastWeek) : null;
  const open = () => router.push({ pathname: "/r/[slug]", params: { slug: figures.orders.slug } });

  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${today} ${figures.orders.pluralLabel.toLowerCase()} today, ${versus}`} onPress={open} style={({ pressed }) => [styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.8 }]}>
        <View style={styles.heroTop}>
          <Text style={{ color: colors.muted, fontSize: text.small, fontWeight: "600" }}>{figures.orders.pluralLabel} today</Text>
          {figures.pending != null && figures.pending > 0 ? (
            <View style={[styles.pill, { backgroundColor: colors.accentSoft }]}>
              <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "700" }}>{figures.pending.toLocaleString()} {figures.pendingStatus ?? "pending"}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.big, { color: colors.text }]}>{today.toLocaleString()}</Text>
        <Text style={{ color: colors.muted, fontSize: text.small }}>{versus.charAt(0).toUpperCase() + versus.slice(1)}</Text>
      </Pressable>

      {sales ? (
        <View style={[styles.sales, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="cash-outline" size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.muted, fontSize: text.small }}>Sales, last 7 days</Text>
            <Text style={{ color: colors.text, fontSize: text.heading, fontWeight: "700" }}>{formatMoney(sales.week, figures.currency) ?? sales.week.toLocaleString()}</Text>
          </View>
          {salesChange ? (
            <View style={[styles.pill, { backgroundColor: salesChange.up === false ? colors.surface : colors.accentSoft, borderColor: colors.border, borderWidth: salesChange.up === false ? 1 : 0 }]}>
              <Text style={{ color: salesChange.up === false ? colors.danger : salesChange.up ? colors.success : colors.muted, fontSize: 12, fontWeight: "700" }}>{salesChange.label}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  big: { fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  pill: { borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 3 },
  sales: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
