import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Picture } from "@/components/pictures";
import { Stepper } from "@/components/stepper";
import { Body, Button, Notice, Screen, Title } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useCart, useShop } from "@/lib/cart";
import { display } from "@/lib/format";
import type { ResourceRecord } from "@/lib/resources";
import { cartTotal, type CartLine } from "@/lib/shop";
import { cartItemOf, isAvailable, lineFile } from "@/lib/shop-item";
import { radius, spacing, text, useColors } from "@/lib/theme";

/** What the customer means to buy: each thing, how many, what it comes to, and the way to check out. */
export default function CartScreen() {
  const shop = useShop();
  const cart = useCart();
  const colors = useColors();
  const [gone, setGone] = useState<string[]>([]);

  // Looked at again each time the cart is opened, so it never shows a price that has moved on or a
  // thing that was taken off sale. What is asked for is what is in it when the screen is opened.
  const lines = useRef<CartLine[]>(cart.lines);
  lines.current = cart.lines;
  const { refresh } = cart;
  useFocusEffect(
    useCallback(() => {
      if (!shop || lines.current.length === 0) return;
      let live = true;
      (async () => {
        const answers = await Promise.all(
          lines.current.map(async (line) => {
            try {
              const record = await api.get<ResourceRecord>(`/${shop.catalogue.slug}/${encodeURIComponent(line.id)}`);
              return { id: line.id, record };
            } catch (caught) {
              // Deleted, or no longer allowed: it can't be ordered. Any other trouble (no signal) says nothing about it.
              return { id: line.id, record: caught instanceof ApiError && (caught.status === 404 || caught.status === 403) ? null : undefined };
            }
          }),
        );
        if (!live) return;
        const found = new Map(answers.map((answer) => [answer.id, answer.record]));
        const removed: string[] = [];
        refresh((current) =>
          current.flatMap((line) => {
            const record = found.get(line.id);
            if (record === undefined) return [line];
            if (record === null || !isAvailable(shop, record)) {
              removed.push(line.title);
              return [];
            }
            return [{ ...line, ...cartItemOf(shop, record) }];
          }),
        );
        setGone(removed);
      })();
      return () => {
        live = false;
      };
    }, [shop, refresh]),
  );

  if (!shop) {
    return (
      <Screen inTabs>
        <Title>Cart</Title>
        <Body muted>There is nothing to order in this app.</Body>
      </Screen>
    );
  }

  const priceField = shop.price ? shop.catalogue.fields[shop.price] : null;
  const total = cartTotal(cart.lines);
  const money = (amount: number) => (priceField ? display(priceField, amount) : String(amount));

  return (
    <Screen inTabs>
      <Title>Cart</Title>

      {gone.length > 0 ? <Notice>{`No longer available, so taken out: ${gone.join(", ")}.`}</Notice> : null}

      {cart.lines.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="cart-outline" size={28} color={colors.muted} />
          <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>Your cart is empty</Text>
          <Body muted small>Add something from the shop and it will be here.</Body>
          <Button label={`Browse ${shop.catalogue.pluralLabel.toLowerCase()}`} onPress={() => router.navigate("/")} />
        </View>
      ) : (
        <>
          <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {cart.lines.map((line, index) => (
              <View key={line.id} style={[styles.line, index < cart.lines.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
                <Picture file={lineFile(line)} size={64} />
                <View style={{ flex: 1, gap: spacing.xs }}>
                  <Text numberOfLines={2} style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>{line.title}</Text>
                  {line.price !== null ? <Text style={{ color: colors.muted, fontSize: text.small }}>{money(line.price)}{line.quantity > 1 ? ` each · ${money(line.price * line.quantity)}` : ""}</Text> : null}
                  <Stepper value={line.quantity} min={0} label={line.title} onChange={(next) => cart.setQuantity(line.id, next)} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${line.title}`} hitSlop={8} onPress={() => cart.remove(line.id)}>
                  <Ionicons name="trash-outline" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}
          </View>

          <View style={styles.total}>
            <Text style={{ color: colors.muted, fontSize: text.body }}>{total.complete ? "Total" : "At least"}</Text>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{money(total.amount)}</Text>
          </View>
          <Body muted small>The final total is worked out when you place the order.</Body>

          <Button label="Checkout" icon="arrow-forward" onPress={() => router.push("/shop/checkout")} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, alignItems: "center" },
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  line: { padding: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md },
  total: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
});
