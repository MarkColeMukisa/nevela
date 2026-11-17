import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { HomeHeader } from "@/components/home-header";
import { Picture } from "@/components/pictures";
import { Body, Button, Notice, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { display } from "@/lib/format";
import { titleField, useResources, type ResourceRecord } from "@/lib/resources";
import type { Shop } from "@/lib/shop";
import { cartItemOf, pictureOf, priceOf, titleOf } from "@/lib/shop-item";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { loadInbox } from "@/app/notifications";

const PER_PAGE = 20;

interface Page {
  data: ResourceRecord[];
  meta: { page: number; totalPages: number; total: number };
}

/**
 * The customer's home when the app has a shop: what is sold, as pictures, to search and to
 * narrow by category, and a button on each to put it in the cart. Only what can be ordered
 * is listed, when the catalogue says which that is.
 */
export function ShopHome({ shop }: { shop: Shop }) {
  const colors = useColors();
  const cart = useCart();
  const { byName } = useResources();
  const inbox = useLoaded(loadInbox);

  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [items, setItems] = useState<ResourceRecord[]>([]);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Searches and pages overlap; only the newest answer is shown.
  const latest = useRef(0);

  const priceField = shop.price ? shop.catalogue.fields[shop.price] : null;

  // The categories to narrow by, when what is sold is grouped.
  const grouping = shop.category ? shop.catalogue.fields[shop.category] : undefined;
  const categories = useLoaded(
    useCallback(async () => {
      const target = grouping?.target ? byName(grouping.target) : undefined;
      if (!target) return [];
      const { data } = await api.get<{ data: ResourceRecord[] }>(`/${target.slug}`, { perPage: 30 });
      return data.map((record) => ({ id: record.id, title: String(record[titleField(target)] ?? "") }));
    }, [grouping, byName]),
  );

  const load = useCallback(
    async (wanted: number, text: string, chosen: string | null) => {
      const mine = ++latest.current;
      try {
        const asked: Record<string, string | number | boolean> = { page: wanted, perPage: PER_PAGE, q: text.trim() };
        if (shop.category && chosen) asked[`filter[${shop.category}]`] = chosen;
        if (shop.available) asked[`filter[${shop.available}]`] = true;
        const answer = await api.get<Page>(`/${shop.catalogue.slug}`, asked);
        if (mine !== latest.current) return;
        setItems((current) => (wanted === 1 ? answer.data : [...current, ...answer.data.filter((record) => !current.some((had) => had.id === record.id))]));
        setPage(answer.meta.page);
        setPages(answer.meta.totalPages);
        setError(null);
      } catch (caught) {
        if (mine === latest.current) setError(caught);
      } finally {
        if (mine === latest.current) setLoading(false);
      }
    },
    [shop],
  );

  // A search starts a moment after the typing stops.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    load(1, query, category);
  }, [load, query, category]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(1, query, category), inbox.refresh(), categories.refresh()]);
    setRefreshing(false);
  };

  const inCart = (id: string) => cart.lines.find((line) => line.id === id)?.quantity ?? 0;

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      <HomeHeader unread={inbox.data?.unread ?? 0} />

      <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Ionicons name="search-outline" size={18} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search"
          placeholder={`Search ${shop.catalogue.pluralLabel.toLowerCase()}`}
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={8} onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {(categories.data?.length ?? 0) > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ marginHorizontal: -spacing.lg }}>
          <View style={{ width: spacing.lg - spacing.sm }} />
          {[{ id: null as string | null, title: "All" }, ...(categories.data ?? [])].map((chip) => {
            const on = chip.id === category;
            return (
              <Pressable
                key={chip.id ?? "all"}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setCategory(chip.id)}
                style={[styles.chip, { backgroundColor: on ? colors.brand : colors.surface, borderColor: on ? colors.brand : colors.border }]}>
                <Text style={{ color: on ? colors.onBrand : colors.text, fontSize: text.small, fontWeight: "600" }}>{chip.title}</Text>
              </Pressable>
            );
          })}
          <View style={{ width: spacing.lg - spacing.sm }} />
        </ScrollView>
      ) : null}

      {error ? <Notice>{messageOf(error)}</Notice> : null}

      {loading && items.length === 0 ? (
        <View style={{ padding: spacing.xl }}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : items.length === 0 && !error ? (
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>
          <Body muted>{query || category ? "Nothing matches. Try another word or category." : `Nothing is on sale yet.`}</Body>
          {query || category ? <Button variant="link" label="Clear the search" onPress={() => { setSearch(""); setCategory(null); }} /> : null}
        </View>
      ) : (
        <View style={styles.grid}>
          {items.map((item) => {
            const price = priceOf(shop, item);
            const count = inCart(item.id);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${titleOf(shop, item)}${price !== null && priceField ? `, ${display(priceField, price)}` : ""}`}
                onPress={() => router.push({ pathname: "/shop/[id]", params: { id: item.id } })}
                style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
                <Picture file={pictureOf(shop, item)} size="fill" rendition="card" />
                <View style={styles.cardText}>
                  <Text numberOfLines={2} style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>{titleOf(shop, item)}</Text>
                  {price !== null && priceField ? <Text style={{ color: colors.muted, fontSize: text.small }}>{display(priceField, price)}</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${titleOf(shop, item)} to the cart`}
                  hitSlop={6}
                  onPress={() => cart.add(cartItemOf(shop, item))}
                  style={[styles.add, { backgroundColor: colors.brand }]}>
                  {count > 0 ? <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: text.small }}>{count}</Text> : <Ionicons name="add" size={20} color={colors.onBrand} />}
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      )}

      {page < pages ? (
        <Button variant="secondary" label="Show more" busy={more} disabled={more || loading} onPress={async () => { setMore(true); await load(page + 1, query, category); setMore(false); }} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: 46, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  searchInput: { flex: 1, minHeight: 44, fontSize: text.body },
  chip: { minHeight: 36, paddingHorizontal: spacing.lg, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: spacing.md },
  card: { width: "48%", borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  cardText: { padding: spacing.md, gap: 2 },
  add: { position: "absolute", right: spacing.sm, top: spacing.sm, minWidth: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
