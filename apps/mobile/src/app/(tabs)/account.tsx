import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, Field, Heading, Notice, Row, Screen, Title } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { spacing, text, useColors } from "@/lib/theme";

/** Your account: who you are here, your name, and how you sign in. */
export default function Account() {
  const { user, reload } = useAuth();
  const colors = useColors();
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.patch("/auth/me", { name: name.trim() });
      await reload();
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const initials = (user.name ?? user.email ?? "?").trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
  const changed = name.trim() !== (user.name ?? "") && name.trim() !== "";

  return (
    <Screen>
      <Title>Account</Title>

      <View style={styles.who}>
        {user.image ? (
          <Image source={{ uri: user.image }} style={styles.avatar} accessibilityLabel="Your profile picture" />
        ) : (
          <View style={[styles.avatar, styles.initials, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.text, fontSize: text.heading, fontWeight: "600" }}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: colors.text, fontSize: text.heading, fontWeight: "600" }}>{user.name ?? "No name yet"}</Text>
          <Body muted small>{user.email}</Body>
        </View>
      </View>

      {error && !(error instanceof ApiError && error.issue("name")) ? <Notice>{messageOf(error)}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}

      <Field label="Name" value={name} onChangeText={(value) => { setName(value); setSaved(false); }} error={error instanceof ApiError ? error.issue("name") : undefined} autoComplete="name" textContentType="name" returnKeyType="done" />
      <Button label="Save" busy={busy} disabled={!changed} onPress={save} />

      <View style={{ gap: spacing.sm }}>
        <Heading>Access</Heading>
        <Card>
          <Row icon="shield-outline" label="Roles" value={user.roles.length > 0 ? user.roles.join(", ") : "None"} />
          <Row icon="mail-outline" label="Email" value={user.emailVerified ? "Verified" : "Not verified"} />
          <Row icon="key-outline" label="Two-step sign-in" value={user.twoFactorEnabled ? "On" : "Off"} last />
        </Card>
        <Body muted small>Roles, two-step sign-in and your profile picture are changed in the dashboard.</Body>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Heading>Sign-in</Heading>
        <Card>
          <Row icon="lock-closed-outline" label="Change password" onPress={() => router.push("/change-password")} last />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  initials: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
