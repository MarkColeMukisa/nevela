import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { Button, Card, Heading, Row, Screen, Title } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loadAppearance, setAppearance, spacing, type AppearanceChoice } from "@/lib/theme";

/** Settings: the devices you are signed in on, what this app is talking to, and signing out. */
export default function Settings() {
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  const [appearance, setChosen] = useState<AppearanceChoice>("system");

  useEffect(() => {
    loadAppearance().then(setChosen);
  }, []);

  const choose = (choice: AppearanceChoice) => {
    setChosen(choice);
    setAppearance(choice);
  };

  return (
    <Screen inTabs>
      <Title>Settings</Title>

      <View style={{ gap: spacing.sm }}>
        <Heading>Security</Heading>
        <Card>
          <Row icon="key-outline" label="Two-step sign-in and passkeys" onPress={() => router.push("/security")} />
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
          <Row icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} last />
        </Card>
      </View>

      <Button variant="danger" label="Sign out" icon="log-out-outline" busy={leaving} onPress={async () => { setLeaving(true); try { await signOut(); } finally { setLeaving(false); } }} />
    </Screen>
  );
}
