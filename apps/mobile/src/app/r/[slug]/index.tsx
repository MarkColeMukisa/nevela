import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Picture } from "@/components/pictures";
import { Body, Loading, Notice } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { display, filesOf } from "@/lib/format";
import { may, relatedTitles, titleField, titleOf, useResources, type Resource, type ResourceRecord } from "@/lib/resources";
import { radius, spacing, text, useColors } from "@/lib/theme";

const PER_PAGE = 25;

interface Page {
  data: ResourceRecord[];
  meta: { page: number; totalPages: number; total: number };
}

/** Up to two fields that say the most about a record in one line: a status, an amount, what it belongs to, a date. */
function summaryFields(resource: Resource): string[] {
  const title = titleField(resource);
  const worth = (kind: string, format?: string) => (kind === "enum" ? 0 : format === "money" ? 1 : kind === "belongsTo" ? 2 : kind === "date" || kind === "datetime" ? 3 : kind === "string" ? 4 : kind === "int" || kind === "float" ? 5 : 9);
  return Object.entries(resource.fields)
    .filter(([name, field]) => name !== title && worth(field.kind, field.format) < 9 && !field.when)
    .sort(([, a], [, b]) => worth(a.kind, a.format) - worth(b.kind, b.format))
    .slice(0, 2)
    .map(([name]) => name);
}

/** The list of one resource: search, pull to refresh, and more as you scroll. */
export default function RecordList() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { bySlug, byName, loading: describing } = useResources();
  const { user } = useAuth();
  const colors = useColors();
  const resource = bySlug(slug);

  const [records, setRecords] = useState<ResourceRecord[]>([]);
  const [related, setRelated] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Searches and pages overlap; only the newest answer is shown.
  const latest = useRef(0);

  const load = useCallback(
    async (wanted: number, q: string) => {
      if (!resource) return;
      const mine = ++latest.current;
      try {
        const answer = await api.get<Page>(`/${resource.slug}`, { page: wanted, perPage: PER_PAGE, q: q.trim() });
        if (mine !== latest.current) return;
        setRecords((current) => (wanted === 1 ? answer.data : [...current, ...answer.data.filter((record) => !current.some((had) => had.id === record.id))]));
        setPage(answer.meta.page);
        setPages(answer.meta.totalPages);
        setTotal(answer.meta.total);
        setError(null);

        // What each belongsTo in the summary is called, asked for once per record it points at.
        for (const name of summaryFields(resource)) {
          const field = resource.fields[name];
          const target = field.kind === "belongsTo" && field.target ? byName(field.target) : undefined;
          if (!target) continue;
          const found = await relatedTitles(target, answer.data.map((record) => String(record[name] ?? "")));
          if (mine === latest.current) setRelated((current) => ({ ...current, ...Object.fromEntries(Object.entries(found).map(([id, title]) => [`${name}:${id}`, title])) }));
        }
      } catch (caught) {
        if (mine === latest.current) setError(caught);
      } finally {
        // Only the newest request says the list has arrived. An older search finishing
        // late must not: more pages would then be added to rows that are about to go.
        if (mine === latest.current) setLoading(false);
      }
    },
    [resource, byName],
  );

  // A new search starts a moment after the typing stops.
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => load(1, search), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // What is in the search box now, for a callback that outlives the render it was made in.
  const searching = useRef(search);
  useEffect(() => {
    searching.current = search;
  }, [search]);

  // Back from a record that was created, changed or deleted: the list is read again.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      load(1, searching.current);
    }, [load]),
  );

  if (!resource) return describing ? <Loading /> : <View style={styles.message}><Body muted>There is no such resource in this app.</Body></View>;

  const summary = summaryFields(resource);
  const image = Object.entries(resource.fields).find(([, field]) => field.kind === "file" && field.accept?.includes("image") && !field.multiple)?.[0];
  const canCreate = may(user, resource, "create");

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: resource.pluralLabel,
          headerRight: canCreate
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel={`New ${resource.label.toLowerCase()}`} hitSlop={12} onPress={() => router.push({ pathname: "/r/[slug]/new", params: { slug: resource.slug } })}>
                  <Ionicons name="add" size={28} color={colors.text} />
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={styles.searchBar}>
        <TextInput accessibilityLabel="Search" placeholder={`Search ${resource.pluralLabel.toLowerCase()}`} placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" clearButtonMode="while-editing" returnKeyType="search" style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]} />
      </View>

      {error ? <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}><Notice>{messageOf(error)}</Notice></View> : null}

      {loading && records.length === 0 ? (
        <Loading />
      ) : (
        <FlatList
          data={records}
          keyExtractor={(record) => record.id}
          keyboardShouldPersistTaps="handled"
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(1, search); setRefreshing(false); }}
          onEndReachedThreshold={0.4}
          onEndReached={async () => {
            if (more || loading || page >= pages) return;
            setMore(true);
            await load(page + 1, search);
            setMore(false);
          }}
          ListHeaderComponent={total !== null && records.length > 0 ? <Text style={[styles.count, { color: colors.muted }]}>{total === 1 ? `1 ${resource.label.toLowerCase()}` : `${total.toLocaleString()} ${resource.pluralLabel.toLowerCase()}`}</Text> : undefined}
          ListEmptyComponent={error ? undefined : <View style={styles.message}><Body muted>{search ? `No ${resource.pluralLabel.toLowerCase()} match "${search}".` : `No ${resource.pluralLabel.toLowerCase()} yet.`}</Body></View>}
          ListFooterComponent={more ? <ActivityIndicator style={{ padding: spacing.lg }} color={colors.muted} /> : undefined}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          renderItem={({ item }) => {
            const line = summary
              .map((name) => {
                const field = resource.fields[name];
                return field.kind === "belongsTo" ? related[`${name}:${String(item[name] ?? "")}`] ?? "" : display(field, item[name]);
              })
              .filter(Boolean)
              .join(" · ");
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/r/[slug]/[id]", params: { slug: resource.slug, id: item.id } })} style={({ pressed }) => [styles.item, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}>
                {image ? <Picture file={filesOf(image, resource.fields[image], item)[0]} size={44} /> : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: text.body, fontWeight: "500" }}>{titleOf(resource, item)}</Text>
                  {line ? <Text numberOfLines={1} style={{ color: colors.muted, fontSize: text.small }}>{line}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  search: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: text.body },
  count: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: text.small },
  item: { minHeight: 64, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  message: { padding: spacing.lg },
});
