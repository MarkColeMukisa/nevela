import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { ActivityRow } from "@/components/activity-row";
import { Choice } from "@/components/choice";
import { Body, Button, Loading, Notice, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { ACTION_FILTERS, type Activity, type ActivityAction } from "@/lib/activity";
import { can } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { radius, spacing, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";

interface Page {
  data: Activity[];
  meta: { page: number; total: number; totalPages: number };
}

/** Who did what to which records, newest first: everyone's changes and your own, on what your role may see. */
export default function ActivityScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const [action, setAction] = useState<ActivityAction | null>(null);
  const [more, setMore] = useState<Activity[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState<unknown>(null);
  // Bumped whenever the list starts over: an answer for an older list is dropped.
  const generation = useRef(0);

  const load = useCallback(() => api.get<Page>("/_nevela/activity", { action: action ?? undefined, perPage: 25 }), [action]);
  const log = useLoaded(load);

  const first = useRef(true);
  const { reload } = log;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      generation.current++;
      setMore([]);
      setPage(1);
      reload();
    }, [reload]),
  );

  const restart = () => {
    generation.current++;
    setLoadingMore(false);
    setMore([]);
    setPage(1);
  };

  if (!can(user, "activity.view") || !user) return <Screen edges={["bottom"]}><Body muted>You don't have access to the activity log.</Body></Screen>;

  const rows = [...(log.data?.data ?? []), ...more];
  const total = log.data?.meta.total ?? 0;

  const showMore = async () => {
    const mine = generation.current;
    setLoadingMore(true);
    setProblem(null);
    try {
      const next = await api.get<Page>("/_nevela/activity", { action: action ?? undefined, perPage: 25, page: page + 1 });
      if (mine !== generation.current) return;
      setMore((current) => [...current, ...next.data]);
      setPage(page + 1);
    } catch (caught) {
      if (mine === generation.current) setProblem(caught);
    } finally {
      if (mine === generation.current) setLoadingMore(false);
    }
  };

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={log.refreshing} onRefresh={() => { restart(); log.refresh(); }} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        {ACTION_FILTERS.map((filter) => (
          <Choice key={filter.label} label={filter.label} on={filter.value === action} onPress={() => { restart(); setAction(filter.value); }} />
        ))}
      </ScrollView>

      {log.error || problem ? <Notice>{messageOf(log.error ?? problem)}</Notice> : null}
      {log.loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Body muted>{action ? "Nothing of that kind yet." : "Nothing yet. When anyone adds, changes or deletes a record, it shows here."}</Body>
      ) : (
        <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          {rows.map((entry, index) => (
            <ActivityRow key={entry.id} entry={entry} you={user.id} last={index === rows.length - 1} />
          ))}
        </View>
      )}
      {rows.length < total ? <Button variant="secondary" label="Show more" busy={loadingMore} onPress={showMore} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
});
