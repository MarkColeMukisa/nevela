import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Control, fromControl, toControl } from "@/components/record-form";
import { Body, Button, Card, Heading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf, SlowAnswerError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCanTrack, useCart, useShop } from "@/lib/cart";
import { display } from "@/lib/format";
import { applies, type ResourceRecord } from "@/lib/resources";
import { cartTotal, orderLines, prefillFrom, sortIssues, titleFieldOf, totalFieldOf, type Shop } from "@/lib/shop";
import { spacing, text, useColors } from "@/lib/theme";

/**
 * Checkout: what the order needs to know that the cart doesn't (who and where), and the
 * order, placed with its lines in one request. Laravel works out the number, the prices and
 * the total; what comes back is what the customer is told.
 */
export default function Checkout() {
  const shop = useShop();
  const { user } = useAuth();
  if (!shop || !user) {
    return (
      <Screen edges={["bottom"]}>
        <Body muted>There is nothing to order in this app.</Body>
      </Screen>
    );
  }
  return <CheckoutForm shop={shop} />;
}

function CheckoutForm({ shop }: { shop: Shop }) {
  const { user } = useAuth();
  const cart = useCart();
  const canTrack = useCanTrack(shop);
  const colors = useColors();
  const fields = shop.checkout.map((name) => [name, shop.orders.fields[name]] as const);

  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields.map(([name, field]) => {
        const from = prefillFrom(field, name);
        const start = from === "email" ? user?.email : from === "name" ? user?.name : field.default;
        return [name, toControl(field, start)];
      }),
    ),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [lineIssues, setLineIssues] = useState<Record<number, string[]>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // The request ran out of time: the order may have been placed. Nothing is sent again from here.
  const [unsure, setUnsure] = useState(false);

  const priceField = shop.price ? shop.catalogue.fields[shop.price] : null;
  const total = cartTotal(cart.lines);
  const shown = fields.filter(([, field]) => applies(field, values));

  const set = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setProblems((current) => (current[name] ? { ...current, [name]: "" } : current));
  };

  const place = async () => {
    if (busy || cart.lines.length === 0) return;

    const payload: Record<string, unknown> = {};
    const found: Record<string, string> = {};
    for (const [name, field] of shown) {
      const { value, problem } = fromControl(field, values[name]);
      if (problem) found[name] = problem;
      else if (value !== null && !(Array.isArray(value) && value.length === 0)) payload[name] = value;
    }
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    // The lines as they are now: if Laravel finds a mistake in line 2, it is this cart's second.
    const sent = cart.lines;
    Object.assign(payload, shop.send, { items: orderLines(shop, sent) });

    setBusy(true);
    setError(null);
    setLineIssues({});
    try {
      const saved = await api.post<ResourceRecord>(`/${shop.orders.slug}`, payload);
      // Placed. What the customer is told is Laravel's: its number, its total.
      cart.settle(sent.map((line) => line.id));
      const totalField = totalFieldOf(shop.orders)?.[0];
      router.replace({
        pathname: "/shop/placed",
        params: { id: saved.id, number: String(saved[titleFieldOf(shop.orders)] ?? ""), total: totalField && saved[totalField] !== null && saved[totalField] !== undefined ? String(saved[totalField]) : "" },
      });
    } catch (caught) {
      if (caught instanceof SlowAnswerError) setUnsure(true);
      if (caught instanceof ApiError && caught.issues.length > 0) {
        const sorted = sortIssues(caught.issues, shop.product);
        setLineIssues(sorted.lines);
        setProblems(Object.fromEntries(sorted.order.filter((issue) => issue.path in shop.orders.fields).map((issue) => [issue.path, issue.message])));
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const money = (amount: number) => (priceField ? display(priceField, amount) : String(amount));
  const named = error instanceof ApiError ? new Set(error.issues.filter((issue) => issue.path in shop.orders.fields).map((issue) => issue.path)) : new Set<string>();
  // Complaints that belong to neither a line nor a field on this form.
  const other = error instanceof ApiError ? sortIssues(error.issues).order.filter((issue) => !named.has(issue.path)) : [];

  if (cart.lines.length === 0 && !unsure) {
    return (
      <Screen edges={["bottom"]}>
        <Body muted>Your cart is empty.</Body>
        <Button label="Back to the shop" onPress={() => router.navigate("/")} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      {unsure ? (
        <View style={{ gap: spacing.md }}>
          <Notice>The server took too long to answer, so your order may have been placed. Check your orders before ordering again, so it isn't placed twice.</Notice>
          {canTrack ? <Button label="Check my orders" onPress={() => router.navigate("/orders")} /> : null}
          <Button variant="link" label="Back to my cart" onPress={() => router.back()} />
        </View>
      ) : (
        <>
          {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : null}
          {error instanceof ApiError && error.issues.length > 0 ? <Notice>{Object.keys(lineIssues).length > 0 ? "Something in your cart can't be ordered. It is marked below." : "The order wasn't placed. Check the details below."}</Notice> : null}
          {other.length > 0 ? <Notice>{other.map((issue) => issue.message).join(" ")}</Notice> : null}

          <View style={{ gap: spacing.sm }}>
            <Heading>Your order</Heading>
            <Card>
              {cart.lines.map((line, index) => (
                <View key={line.id}>
                  <Row label={`${line.quantity} × ${line.title}`} value={line.price !== null ? money(line.price * line.quantity) : ""} last={index === cart.lines.length - 1 && !lineIssues[index]} />
                  {lineIssues[index] ? (
                    <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                      <Text style={{ color: colors.danger, fontSize: text.small }}>{lineIssues[index].join(" ")}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </Card>
            <Body muted small>{total.complete ? `About ${money(total.amount)}.` : `At least ${money(total.amount)}.`} The final total is worked out when you place it.</Body>
          </View>

          {shown.length > 0 ? (
            <View style={{ gap: spacing.md }}>
              <Heading>Your details</Heading>
              {shown.map(([name, field]) => (
                <Control key={name} name={name} field={field} resource={shop.orders} value={values[name]} problem={problems[name] || undefined} creating onChange={(value) => set(name, value)} />
              ))}
            </View>
          ) : null}

          <Button label="Place order" icon="checkmark" busy={busy} onPress={place} />
          <Button variant="link" label="Back to my cart" disabled={busy} onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
