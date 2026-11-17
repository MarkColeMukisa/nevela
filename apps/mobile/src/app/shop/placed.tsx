import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";

import { Body, Button, Screen } from "@/components/ui";
import { useCanTrack, useShop } from "@/lib/cart";
import { display } from "@/lib/format";
import { totalFieldOf } from "@/lib/shop";
import { spacing, text, useColors } from "@/lib/theme";

/**
 * Shown after an order is placed: Laravel's number for it and its total, and the way to
 * follow it. Nothing here is the phone's own sum.
 */
export default function Placed() {
  const { id, number, total } = useLocalSearchParams<{ id: string; number?: string; total?: string }>();
  const shop = useShop();
  const canTrack = useCanTrack(shop);
  const colors = useColors();

  const totalField = shop ? totalFieldOf(shop.orders)?.[1] ?? (shop.price ? shop.catalogue.fields[shop.price] : null) : null;

  return (
    <Screen edges={["top", "bottom"]} centered>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={{ alignItems: "center", gap: spacing.md }}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 26, fontWeight: "700", letterSpacing: -0.5, textAlign: "center" }}>Order placed</Text>
        {number ? <Text selectable style={{ color: colors.text, fontSize: text.heading, fontWeight: "600" }}>{number}</Text> : null}
        {total && totalField ? <Text style={{ color: colors.muted, fontSize: text.body }}>{display(totalField, Number(total))}</Text> : null}
        <Body muted>We have your order. You can follow it as it is accepted and made ready.</Body>
      </View>
      {shop && id && canTrack ? <Button label="Track this order" icon="receipt-outline" onPress={() => router.replace({ pathname: "/r/[slug]/[id]", params: { slug: shop.orders.slug, id } })} /> : null}
      <Button variant="secondary" label="Keep shopping" onPress={() => router.replace("/")} />
    </Screen>
  );
}
