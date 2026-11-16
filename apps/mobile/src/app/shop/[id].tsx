import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Picture } from "@/components/pictures";
import { Stepper } from "@/components/stepper";
import { Body, Button, Card, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useCart, useShop } from "@/lib/cart";
import { display, filesOf, type StoredFile } from "@/lib/format";
import { fieldLabel, relatedTitles, useResources, type ResourceRecord } from "@/lib/resources";
import { cartItemOf, isAvailable, priceOf, titleOf } from "@/lib/shop-item";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";

/** One thing the shop sells: its pictures, what it is, what it costs, and how many to put in the cart. */
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shop = useShop();
  const cart = useCart();
  const colors = useColors();
  const { byName } = useResources();

  const load = useCallback(() => (shop ? api.get<ResourceRecord>(`/${shop.catalogue.slug}/${encodeURIComponent(id)}`) : Promise.reject(new Error("There is no shop in this app."))), [shop, id]);
  const product = useLoaded(load);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [shown, setShown] = useState(0);
  const [related, setRelated] = useState<Record<string, string>>({});

  const record = product.data;

  // What each thing it belongs to (its category) is called.
  useEffect(() => {
    if (!shop || !record) return;
    let live = true;
    (async () => {
      for (const [name, field] of Object.entries(shop.catalogue.fields)) {
        const target = field.kind === "belongsTo" && field.target ? byName(field.target) : undefined;
        const value = record[name];
        if (!target || !value) continue;
        const found = await relatedTitles(target, [String(value)]);
        if (live && found[String(value)]) setRelated((current) => ({ ...current, [name]: found[String(value)] }));
      }
    })();
    return () => {
      live = false;
    };
  }, [shop, record, byName]);

  if (!shop) return <Screen edges={["bottom"]}><Body muted>There is nothing to order in this app.</Body></Screen>;
  if (product.loading) return <Loading />;
  if (!record) {
    const gone = product.error instanceof ApiError && product.error.status === 404;
    return (
      <Screen edges={["bottom"]}>
        <Stack.Screen options={{ title: shop.catalogue.label }} />
        <Notice>{gone ? `This ${shop.catalogue.label.toLowerCase()} isn't here any more.` : messageOf(product.error)}</Notice>
      </Screen>
    );
  }

  const priceField = shop.price ? shop.catalogue.fields[shop.price] : null;
  const price = priceOf(shop, record);
  const available = isAvailable(shop, record);
  const pictures: StoredFile[] = Object.entries(shop.catalogue.fields).flatMap(([name, field]) => (field.kind === "file" && field.accept?.includes("image") ? filesOf(name, field, record) : []));
  const description = shop.description ? display(shop.catalogue.fields[shop.description], record[shop.description]) : "";
  // The rest of what it is: a size, a flavour. Not what the shop already shows another way.
  const facts = Object.entries(shop.catalogue.fields).filter(
    ([name, field]) =>
      ![shop.title, shop.price, shop.description, shop.available].includes(name) && field.kind !== "file" && field.kind !== "json" && field.kind !== "text" && record[name] !== null && record[name] !== undefined && record[name] !== "",
  );

  const add = () => {
    cart.add(cartItemOf(shop, record), quantity);
    setAdded(true);
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: titleOf(shop, record) }} />

      <Picture file={pictures[shown] ?? null} size="fill" rendition="card" />
      {pictures.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {pictures.map((file, index) => (
            <Pressable key={file.url} accessibilityRole="button" accessibilityLabel={`Picture ${index + 1}`} onPress={() => setShown(index)} style={[styles.thumb, { borderColor: index === shown ? colors.brand : colors.border }]}>
              <Picture file={file} size={56} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.4 }}>{titleOf(shop, record)}</Text>
        {price !== null && priceField ? <Text style={{ color: colors.text, fontSize: text.heading, fontWeight: "600" }}>{display(priceField, price)}</Text> : null}
      </View>

      {description ? <Body muted>{description}</Body> : null}

      {facts.length > 0 ? (
        <Card>
          {facts.map(([name, field], index) => (
            <Row key={name} label={fieldLabel(name, field)} value={field.kind === "belongsTo" ? related[name] ?? "" : display(field, record[name])} last={index === facts.length - 1} />
          ))}
        </Card>
      ) : null}

      {!available ? (
        <Notice>This isn't available right now.</Notice>
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={styles.quantity}>
            <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>How many</Text>
            <Stepper value={quantity} min={1} label={titleOf(shop, record)} onChange={(next) => { setQuantity(Math.max(1, next)); setAdded(false); }} />
          </View>
          <Button
            icon="cart-outline"
            label={price !== null && priceField ? `Add to cart · ${display(priceField, price * quantity)}` : "Add to cart"}
            onPress={add}
          />
        </View>
      )}

      {added ? (
        <View style={{ gap: spacing.sm }}>
          <Notice tone="success">{quantity === 1 ? "Added to your cart." : `${quantity} added to your cart.`}</Notice>
          <Button variant="secondary" label="View cart" onPress={() => router.navigate("/cart")} />
          <Button variant="link" label="Keep shopping" onPress={() => router.back()} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumb: { borderWidth: 2, borderRadius: radius.sm, padding: 1 },
  quantity: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
