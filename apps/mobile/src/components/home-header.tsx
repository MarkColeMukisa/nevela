import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { site } from "@/lib/site";
import { radius, spacing, text, useColors } from "@/lib/theme";

/** "Good evening": the greeting a person would give at this hour. */
function greeting(now: Date): string {
  const hour = now.getHours();
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** The top of a home screen, for staff and customers alike: today's date, a greeting, the bell and the person's picture. */
export function HomeHeader({ unread }: { unread: number }) {
  const { user } = useAuth();
  const colors = useColors();
  const [now, setNow] = useState(() => new Date());
  // Kept up to date, so a home left open past midnight, or into the afternoon, doesn't greet with yesterday's.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  // Browsing before signing in: a welcome, and the way to sign in where the bell would be.
  if (!user) {
    return (
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.muted, fontSize: text.small }}>{greeting(now)}</Text>
          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 24, fontWeight: "700", letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>
            Welcome to {site.name}
          </Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push("/sign-in")} style={[styles.signIn, { backgroundColor: colors.brand }]}>
          <Text style={{ color: colors.onBrand, fontWeight: "700", fontSize: text.small }}>Sign in</Text>
        </Pressable>
      </View>
    );
  }

  const first = user.name?.trim().split(/\s+/)[0];

  return (
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
  );
}

/** What someone sees when the app has nothing for their account yet: a sign-up with no role that allows anything, say. */
export function NothingShared() {
  const colors = useColors();
  return (
    <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="checkmark-circle-outline" size={22} color={colors.accent} />
      <Text style={{ color: colors.text, fontSize: text.body, fontWeight: "600" }}>Your account is ready</Text>
      <Body muted small>Nothing has been shared with you yet. Someone who manages {site.name} can give your account access, and it will appear here.</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  signIn: { minHeight: 38, paddingHorizontal: spacing.lg, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "700" },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  initials: { alignItems: "center", justifyContent: "center" },
  empty: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
});
