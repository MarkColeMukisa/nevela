import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Body, Button, Card, Heading, Row, Screen, Title } from "@/components/ui";
import { API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { spacing } from "@/lib/theme";

/** Settings: the devices you are signed in on, what this app is talking to, and signing out. */
export default function Settings() {
  const { signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);

  return (
    <Screen>
      <Title>Settings</Title>

      <View style={{ gap: spacing.sm }}>
        <Heading>Security</Heading>
        <Card>
          <Row icon="phone-portrait-outline" label="Devices" detail="Where you are signed in, and signing one out" onPress={() => router.push("/devices")} last />
        </Card>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Heading>About</Heading>
        <Card>
          <Row icon="server-outline" label="Server" detail={API_URL} />
          <Row icon="information-circle-outline" label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} last />
        </Card>
        <Body muted small>The app follows your phone's light or dark appearance.</Body>
      </View>

      <Button variant="danger" label="Sign out" icon="log-out-outline" busy={leaving} onPress={async () => { setLeaving(true); await signOut(); }} />
    </Screen>
  );
}
