import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { Body, Button, Loading, Notice, Screen, Title } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useShop } from "@/lib/cart";
import { display } from "@/lib/format";
import { optionLabel, type ResourceRecord } from "@/lib/resources";
import { titleFieldOf } from "@/lib/shop";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

interface Page {
  data: ResourceRecord[];
}

/** The customer's orders, newest first: its number, where it has got to, and what it came to. Laravel shows each person only their own. */
export default function Orders() {
  const shop = useShop();
  const colors = useColors();

  const load = useCallback(() => (shop ? api.get<Page>(`/${shop.orders.slug}`, { perPage: 50 }) : Promise.resolve({ data: [] } as Page)), [shop]);
  const orders = useLoaded(load);

  // Looked at again each time the tab is opened: a status changes while the app is closed.
  const first = useRef(true);
  const { reload } = orders;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );

  if (!shop) return <Screen inTabs><Title>Orders</Title><Body muted>There is nothing to order in this app.</Body></Screen>;
  if (orders.loading) return <Loading />;

  const status = Object.entries(shop.orders.fields).find(([name, field]) => /^(status|state|stage)$/i.test(name) && field.kind === "enum");
  const total = Object.entries(shop.orders.fields).find(([, field]) => field.kind === "float" && field.format === "money");
  const title = titleFieldOf(shop.orders);
  const rows = orders.data?.data ?? [];

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={orders.refreshing} onRefresh={orders.refresh} />}>
      <Title>Orders</Title>
      {orders.error ? <Notice>{messageOf(orders.error)}</Notice> : null}

      {rows.length === 0 && !orders.error ? (
        <View style={{ gap: spacing.md }}>
          <Body muted>You haven't placed an order yet.</Body>
          <Button label="Start shopping" onPress={() => router.navigate("/")} />
        </View>
      ) : (
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {rows.map((order, index) => {
            const value = status ? String(order[status[0]] ?? "") : "";
            return (
              <Pressable
                key={order.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: "/r/[slug]/[id]", params: { slug: shop.orders.slug, id: order.id } })}
                style={({ pressed }) => [styles.row, index < rows.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>{String(order[title] ?? "Order")}</Text>
                  <Text style={{ color: colors.muted, fontSize: text.small }}>{ago(String(order.createdAt ?? ""))}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  {status && value ? (
                    <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                      <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>{optionLabel(status[1], value)}</Text>
                    </View>
                  ) : null}
                  {total && order[total[0]] !== null && order[total[0]] !== undefined ? <Text style={{ color: colors.text, fontSize: text.small }}>{display(total[1], order[total[0]])}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  row: { padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 12 },
});
