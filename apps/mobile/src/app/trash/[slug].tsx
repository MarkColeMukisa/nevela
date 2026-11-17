import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, Text, View } from "react-native";

import { Body, Button, Card, Loading, Notice, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { timeLeft, type TrashRecord } from "@/lib/activity";
import { spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

interface Page {
  data: TrashRecord[];
  meta: { page: number; total: number; totalPages: number };
}

/** What was deleted from one kind of record: bring it back, or remove it for good. */
export default function TrashOf() {
  const { slug, title } = useLocalSearchParams<{ slug: string; title?: string }>();
  const colors = useColors();
  const load = useCallback(() => api.get<Page>(`/_nevela/trash/${slug}`, { perPage: 50 }), [slug]);
  const trash = useLoaded(load);
  const [working, setWorking] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState<string | null>(null);
  // One change at a time: a second press while one is under way would answer for the wrong row.
  const busy = useRef(false);

  if (trash.loading) return <Loading />;
  const rows = trash.data?.data ?? [];
  const total = trash.data?.meta.total ?? 0;

  const run = async (id: string | null, what: () => Promise<unknown>, said: string) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(id);
    setError(null);
    setDone(null);
    try {
      await what();
      setAsking(null);
      setEmptying(false);
      setDone(said);
      await trash.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={trash.refreshing} onRefresh={trash.refresh} />}>
      <Stack.Screen options={{ title: title ?? "Trash" }} />
      {error || trash.error ? <Notice>{messageOf(error ?? trash.error)}</Notice> : null}
      {done ? <Notice tone="success">{done}</Notice> : null}

      {rows.length === 0 && !trash.error ? (
        <Body muted>Nothing deleted here.</Body>
      ) : (
        <View style={{ gap: spacing.md }}>
          {rows.map((record) => (
            <Card key={record.id}>
              <View style={{ padding: spacing.lg, gap: spacing.sm }}>
                <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>{record.label}</Text>
                <Text style={{ color: colors.muted, fontSize: text.small }}>
                  {record.deletedAt ? `Deleted ${ago(record.deletedAt)}` : "Deleted"} · {timeLeft(record.expiresAt)}
                </Text>
                {asking === record.id ? (
                  <View style={{ gap: spacing.sm }}>
                    <Body muted small>Remove it for good? It can't be brought back.</Body>
                    <Button variant="danger" label="Yes, remove it" busy={working === record.id} disabled={working !== null} onPress={() => run(record.id, () => api.delete(`/_nevela/trash/${slug}/${record.id}`), "Removed for good.")} />
                    <Button variant="secondary" label="Keep it" disabled={working !== null} onPress={() => setAsking(null)} />
                  </View>
                ) : (
                  <View style={{ gap: spacing.sm }}>
                    <Button label="Restore" icon="refresh-outline" busy={working === record.id} disabled={working !== null} onPress={() => run(record.id, () => api.post(`/_nevela/trash/${slug}/${record.id}/restore`), "Restored.")} />
                    <Button variant="link" label="Remove for good" disabled={working !== null} onPress={() => setAsking(record.id)} />
                  </View>
                )}
              </View>
            </Card>
          ))}
          {total > rows.length ? <Body muted small>Showing the latest {rows.length} of {total}.</Body> : null}

          {emptying ? (
            <View style={{ gap: spacing.sm }}>
              <Body muted>Remove everything in this trash for good? It can't be brought back.</Body>
              <Button variant="danger" label="Yes, empty it" busy={working === "all"} disabled={working !== null} onPress={() => run("all", () => api.delete(`/_nevela/trash/${slug}?confirm=${encodeURIComponent(slug)}`), "The trash is empty.")} />
              <Button variant="secondary" label="Keep it" disabled={working !== null} onPress={() => setEmptying(false)} />
            </View>
          ) : (
            <Button variant="danger" label="Empty this trash" disabled={working !== null} onPress={() => setEmptying(true)} />
          )}
        </View>
      )}
    </Screen>
  );
}
