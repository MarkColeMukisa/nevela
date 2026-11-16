import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { Spark } from "@/components/spark";
import { Body, Heading, Notice, Screen, type IconName } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { iconFor } from "@/lib/icons";
import { may, useResources, type Resource } from "@/lib/resources";
import { site } from "@/lib/site";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";
import { loadInbox, type Inbox } from "../notifications";

/** The most resources the home shows a card for. The rest are a tap away, under Records. */
const CARDS = 6;

interface Figures {
  /** Every record of it. */
  total: number;
  /** Made in the last seven days, and in the seven before. */
  week: number;
  lastWeek: number;
  /** Made each day for the last thirty, oldest first. */
  days: number[];
}

interface Activity {
  id: string;
  action: "created" | "updated" | "deleted" | "restored" | "purged";
  label: string;
  slug: string;
  count: number;
  title: string | null;
  recordId: string | null;
  user: { id: string; name: string | null } | null;
  at: string;
}

interface Home {
  figures: Record<string, Figures | null>;
  users: number | null;
  activity: Activity[] | null;
  inbox: Inbox | null;
}

/** "Good evening": the greeting a person would give at this hour. */
function greeting(now = new Date()): string {
  const hour = now.getHours();
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const ACTIONS: Record<Activity["action"], { icon: IconName; verb: string }> = {
  created: { icon: "add-circle-outline", verb: "added" },
  updated: { icon: "create-outline", verb: "changed" },
  deleted: { icon: "trash-outline", verb: "deleted" },
  restored: { icon: "refresh-outline", verb: "restored" },
  purged: { icon: "close-circle-outline", verb: "removed for good" },
};

/**
 * Home: how the app is doing, from what it holds. A card per resource with how many
 * there are, how many were made this week against last, and the last thirty days; what
 * people changed lately; and a way straight to adding something. Every number is the
 * API's, asked for with the person's own permissions: nothing here is made up.
 */
export default function HomeScreen() {
  const { user, can } = useAuth();
  const { resources, error: describing } = useResources();
  const colors = useColors();
  const shown = resources.slice(0, CARDS);
  const key = shown.map((resource) => resource.slug).join(",");

  const load = useCallback(async (): Promise<Home> => {
    // Each part on its own, so one that fails (a role without the activity log, say) leaves the rest.
    const figuresOf = async (resource: Resource): Promise<Figures | null> => {
      try {
        const [stats, insights] = await Promise.all([
          api.get<{ total: number; current: number; previous: number }>(`/${resource.slug}/_stats`, { days: 7 }),
          api.get<{ series: { count: number }[] }>(`/${resource.slug}/_insights`, { unit: "day" }),
        ]);
        return { total: stats.total, week: stats.current, lastWeek: stats.previous, days: insights.series.map((day) => day.count) };
      } catch {
        return null;
      }
    };
    const [figures, users, activity, inbox] = await Promise.all([
      Promise.all(shown.map(async (resource) => [resource.slug, await figuresOf(resource)] as const)),
      can("users.view") ? api.get<{ meta: { total: number } }>("/_nevela/users", { perPage: 1 }).then((answer) => answer.meta.total).catch(() => null) : Promise.resolve(null),
      can("activity.view") ? api.get<{ data: Activity[] }>("/_nevela/activity", { perPage: 6 }).then((answer) => answer.data).catch(() => null) : Promise.resolve(null),
      loadInbox().catch(() => null),
    ]);
    return { figures: Object.fromEntries(figures), users, activity, inbox };
    // The resources shown decide what to ask for; `key` stands for them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, can]);

  const home = useLoaded(load);
  const [now] = useState(() => new Date());
  if (!user) return null;

  const first = user.name?.trim().split(/\s+/)[0];
  const creatable = resources.filter((resource) => may(user, resource, "create"));
  const unread = home.data?.inbox?.unread ?? 0;
  const conditions = home.data?.inbox?.conditions ?? [];

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={home.refresh} />}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.muted, fontSize: text.small }}>{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>
            {greeting(now)}{first ? `, ${first}` : ""}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={unread > 0 ? `Notifications, ${unread} new` : "Notifications"} hitSlop={8} onPress={() => router.push("/notifications")} style={[styles.round, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="notifications-outline" size={20} color={colors.text} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.danger, borderColor: colors.background }]}>
              <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Your account" hitSlop={8} onPress={() => router.navigate("/account")}>
          {user.image ? (
            <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.avatar, styles.initials, { backgroundColor: colors.brand }]}>
              <Text style={{ color: colors.onBrand, fontWeight: "700" }}>{(user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {conditions.length > 0 ? (
        <Pressable accessibilityRole="button" onPress={() => router.push("/notifications")}>
          <Notice>{conditions.length === 1 ? conditions[0].title : `${conditions.length} things need attention: ${conditions.map((condition) => condition.title).join(" · ")}`}</Notice>
        </Pressable>
      ) : null}
      {describing ?? home.error ? <Notice>{messageOf(describing ?? home.error)}</Notice> : null}

      {creatable.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} style={{ marginHorizontal: -spacing.lg }}>
          <View style={{ width: spacing.lg - spacing.sm }} />
          {creatable.map((resource) => (
            <Pressable
              key={resource.slug}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/r/[slug]/new", params: { slug: resource.slug } })}
              style={({ pressed }) => [styles.chip, { backgroundColor: colors.brand }, pressed && { opacity: 0.7 }]}>
              <Ionicons name="add" size={18} color={colors.onBrand} />
              <Text style={{ color: colors.onBrand, fontSize: text.small, fontWeight: "600" }}>New {resource.label.toLowerCase()}</Text>
            </Pressable>
          ))}
          <View style={{ width: spacing.lg - spacing.sm }} />
        </ScrollView>
      ) : null}

      {shown.length > 0 || home.data?.users != null ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Overview</Heading>
          <View style={styles.grid}>
            {shown.map((resource) => (
              <FigureCard key={resource.slug} resource={resource} figures={home.data?.figures[resource.slug]} loading={home.loading} />
            ))}
            {home.data?.users != null ? (
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
                  <Ionicons name="people-outline" size={18} color={colors.accent} />
                </View>
                <Text style={[styles.total, { color: colors.text }]}>{home.data.users.toLocaleString()}</Text>
                <Text style={{ color: colors.muted, fontSize: text.small }}>Users</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : !home.loading ? (
        <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="sparkles-outline" size={22} color={colors.accent} />
          <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>{site.name} is ready</Text>
          <Body muted small>Add a resource on your computer and it appears here, with its numbers, the next time you pull down. No new build of the app needed:</Body>
          <Text selectable style={[styles.command, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}>nevela resource Product --fields="name:string, price:money, image:image"</Text>
        </View>
      ) : null}

      {home.data?.activity ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Recent activity</Heading>
          {home.data.activity.length === 0 ? (
            <Body muted>Nothing yet. When anyone adds, changes or deletes a record, it shows here.</Body>
          ) : (
            <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {home.data.activity.map((entry, index, all) => (
                <ActivityRow key={entry.id} entry={entry} you={user.id} last={index === all.length - 1} />
              ))}
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

function FigureCard({ resource, figures, loading }: { resource: Resource; figures: Figures | null | undefined; loading: boolean }) {
  const colors = useColors();
  const change = figures ? figures.week - figures.lastWeek : 0;
  const trend = !figures
    ? null
    : figures.week === 0
      ? { text: "None new this week", colour: colors.muted, icon: null }
      : { text: `${figures.week} new this week`, colour: change > 0 ? colors.success : change < 0 ? colors.danger : colors.muted, icon: change > 0 ? ("trending-up" as const) : change < 0 ? ("trending-down" as const) : null };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${resource.pluralLabel}: ${figures ? figures.total : "loading"}`}
      onPress={() => router.push({ pathname: "/r/[slug]", params: { slug: resource.slug } })}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && { opacity: 0.7 }]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name={iconFor(resource.icon)} size={18} color={colors.accent} />
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </View>
      <Text style={[styles.total, { color: colors.text }]}>{figures ? figures.total.toLocaleString() : loading ? "…" : "—"}</Text>
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: text.small }}>{resource.pluralLabel}</Text>
      {figures && figures.days.length > 0 ? <Spark values={figures.days} color={colors.accent} muted={colors.border} height={28} /> : <View style={{ height: 28 }} />}
      {trend ? (
        <View style={styles.trend}>
          {trend.icon ? <Ionicons name={trend.icon} size={14} color={trend.colour} /> : null}
          <Text numberOfLines={1} style={{ color: trend.colour, fontSize: 12, fontWeight: "500" }}>{trend.text}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ActivityRow({ entry, you, last }: { entry: Activity; you: string; last: boolean }) {
  const colors = useColors();
  const action = ACTIONS[entry.action] ?? ACTIONS.updated;
  const who = entry.user ? (entry.user.id === you ? "You" : entry.user.name ?? "Someone") : "Someone";
  const what = entry.count > 1 ? `${entry.count} ${entry.label.toLowerCase()}s` : entry.title ? entry.title : `a ${entry.label.toLowerCase()}`;
  const opens = entry.recordId && entry.count === 1 && entry.action !== "deleted" && entry.action !== "purged";

  const row = (
    <View style={[styles.activity, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <View style={[styles.activityIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={action.icon} size={16} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2} style={{ color: colors.text, fontSize: text.small + 1 }}>
          <Text style={{ fontWeight: "600" }}>{who}</Text> {action.verb} <Text style={{ fontWeight: "600" }}>{what}</Text>
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{entry.label} · {ago(entry.at)}</Text>
      </View>
    </View>
  );
  if (!opens) return row;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/r/[slug]/[id]", params: { slug: entry.slug, id: entry.recordId as string } })} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  initials: { alignItems: "center", justifyContent: "center" },
  chip: { minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: 20, flexDirection: "row", alignItems: "center", gap: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: { flexGrow: 1, flexBasis: "45%", minWidth: 150, borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  total: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  trend: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  empty: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  command: { borderWidth: 1, borderRadius: radius.sm, padding: spacing.md, fontSize: 12, fontFamily: "monospace" },
  list: { borderWidth: 1, borderRadius: radius.lg, overflow: "hidden" },
  activity: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  activityIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
