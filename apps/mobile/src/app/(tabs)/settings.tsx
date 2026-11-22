import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button, Card, Heading, Row, Screen, Title } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadAppearance, setAppearance, spacing, type AppearanceChoice } from "@/lib/theme";
import { loadInbox, type Inbox } from "../notifications";

/**
 * Settings, which staff see as More: their account and every record, then the devices you are signed in on, what this app is talking to, and signing out. A new
 * Nevela release is told of under About, for whoever builds the app: whoever runs the business
 * can't act on it, so it stays off their home screen.
 */
export default function Settings() {
  const { signOut, shell, user } = useAuth();
  // For staff this tab is More: what isn't one of the tabs (packages/shared/layout.ts) is reached from here.
  const staff = user !== null && shell !== "customer";
  const [leaving, setLeaving] = useState(false);
  const [appearance, setChosen] = useState<AppearanceChoice>("system");
  const [release, setRelease] = useState<Inbox["conditions"][number] | null>(null);

  useEffect(() => {
    loadAppearance().then(setChosen);
    // Administrators only: the API tells no one else of a release.
    loadInbox().then((inbox) => setRelease(inbox.conditions.find((condition) => condition.id === "release") ?? null)).catch(() => undefined);
  }, []);

  const choose = (choice: AppearanceChoice) => {
    setChosen(choice);
    setAppearance(choice);
  };

  return (
    <Screen inTabs>
      <Title>{staff ? "More" : "Settings"}</Title>

      {staff ? (
        <Card>
          <Row icon="person-outline" label="Account" detail="Your profile, and people, roles, activity and the trash where your role allows" onPress={() => router.push("/account")} />
          <Row icon="albums-outline" label="All records" detail="Every resource your role may see" onPress={() => router.push("/records")} last />
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Heading>Security</Heading>
        <Card>
          <Row icon="key-outline" label="Two-step sign-in" detail="Authenticator and codes, and removing passkeys" onPress={() => router.push("/security")} />
          <Row icon="phone-portrait-outline" label="Devices" detail="Where you are signed in, and signing one out" onPress={() => router.push("/devices")} last />
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Heading>Appearance</Heading>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {(["system", "light", "dark"] as const).map((choice) => (
            <View key={choice} style={{ flex: 1 }}>
              <Button variant={appearance === choice ? "primary" : "secondary"} label={choice === "system" ? "Phone's" : choice === "light" ? "Light" : "Dark"} onPress={() => choose(choice)} />
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Heading>About</Heading>
        <Card>
          <Row icon="server-outline" label="Server" detail={API_URL} />
          <Row icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} last={release === null} />
          {release ? <Row icon="rocket-outline" label={release.title} detail={`For whoever builds the app. ${release.body}`} last /> : null}
        </Card>
      </View>

      <Button variant="danger" label="Sign out" icon="log-out-outline" busy={leaving} onPress={async () => { setLeaving(true); try { await signOut(); } finally { setLeaving(false); } }} />
    </Screen>
  );
}
