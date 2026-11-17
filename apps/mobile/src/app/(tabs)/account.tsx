import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AddPicture } from "@/components/pictures";
import { Body, Button, Card, Field, Heading, Notice, Row, Screen, Title } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { can } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { spacing, text, useColors } from "@/lib/theme";
import { uploadAvatar, type Picked } from "@/lib/upload";
import { Image } from "expo-image";

/** Your account: who you are here, your name, and how you sign in. */
export default function Account() {
  const { user, reload } = useAuth();
  const colors = useColors();
  const [name, setName] = useState(user?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);

  if (!user) return null;

  const changePicture = async (picked: Picked[]) => {
    setSending(true);
    setError(null);
    setSaved(false);
    try {
      await uploadAvatar(picked[0]);
      await reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(false);
    }
  };

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
  const manages = can(user, "users.view") || can(user, "roles.view");
  const changed = name.trim() !== (user.name ?? "") && name.trim() !== "";

  return (
    <Screen inTabs>
      <Title>Account</Title>

      <View style={styles.who}>
        {user.image ? (
          <Image source={{ uri: user.image }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={150} accessibilityLabel="Your profile picture" />
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

      <AddPicture label="Library" square busy={sending} onPicked={changePicture} onError={setError} />

      {error && !(error instanceof ApiError && error.issue("name")) ? <Notice>{messageOf(error)}</Notice> : null}
      {saved ? <Notice tone="success">Saved.</Notice> : null}

      <Field label="Name" value={name} onChangeText={(value) => { setName(value); setSaved(false); }} error={error instanceof ApiError ? error.issue("name") : undefined} autoComplete="name" textContentType="name" returnKeyType="done" />
      <Button label="Save" busy={busy} disabled={!changed} onPress={save} />

      <View style={{ gap: spacing.sm }}>
        <Heading>Access</Heading>
        <Card>
          <Row icon="shield-outline" label="Roles" value={user.roles.length > 0 ? user.roles.join(", ") : "None"} />
          <Row icon="mail-outline" label="Email" value={user.emailVerified ? "Verified" : "Not verified"} />
          <Row icon="key-outline" label="Two-step sign-in" value={user.twoFactorEnabled ? "On" : "Off"} onPress={() => router.push("/security")} last={!manages} />
          {can(user, "users.view") ? <Row icon="people-outline" label="People" detail="Who can sign in, and their roles" onPress={() => router.push("/access/users")} last={!can(user, "roles.view")} /> : null}
          {can(user, "roles.view") ? <Row icon="shield-checkmark-outline" label="Roles and permissions" detail="What each role may do" onPress={() => router.push("/access/roles")} last /> : null}
        </Card>
        {!manages ? <Body muted small>Roles are given by someone who may manage users.</Body> : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Heading>Sign-in</Heading>
        <Card>
          <Row icon="lock-closed-outline" label="Change password" onPress={() => router.push("/change-password")} />
          <Row icon="key-outline" label="Two-step sign-in" detail={user.twoFactorEnabled ? "Two-step sign-in is on" : "Two-step sign-in is off"} onPress={() => router.push("/security")} last />
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
