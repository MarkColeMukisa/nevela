import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Body, Button, Card, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

interface Device {
  id: string;
  name: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  lastUsedAt: string | null;
  /** The one this app is signed in as. */
  current: boolean;
}

const loadDevices = () => api.get<{ data: Device[] }>("/auth/sessions");

/** Everywhere this account is signed in: browsers and phones alike. Sign one out, or all the others. */
export default function Devices() {
  const devices = useLoaded(loadDevices);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (devices.loading) return <Loading />;

  const act = async (id: string, path: string) => {
    setWorking(id);
    setError(null);
    try {
      await api.delete(path);
      await devices.reload();
    } catch (caught) {
      setError(caught);
    } finally {
      setWorking(null);
    }
  };

  const all = devices.data?.data ?? [];
  const others = all.filter((device) => !device.current);
  const shown = error ?? devices.error;

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={devices.refreshing} onRefresh={devices.refresh} />}>
      {shown ? <Notice>{messageOf(shown)}</Notice> : null}

      {all.map((device) => (
        <Card key={device.id}>
          <Row
            icon={device.current ? "phone-portrait" : "laptop-outline"}
            label={device.name || "Unnamed device"}
            detail={[device.current ? "This device" : `Last used ${ago(device.lastUsedAt)}`, device.ipAddress].filter(Boolean).join(" · ")}
            last={device.current}
          />
          {device.current ? null : (
            <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
              <Button variant="secondary" label="Sign out this device" busy={working === device.id} disabled={working !== null} onPress={() => act(device.id, `/auth/sessions/${encodeURIComponent(device.id)}`)} />
            </View>
          )}
        </Card>
      ))}

      {others.length > 1 ? <Button variant="danger" label="Sign out all other devices" busy={working === "others"} disabled={working !== null} onPress={() => act("others", "/auth/sessions")} /> : null}
      {others.length === 0 && !shown ? <Body muted small>You're signed in on this device only.</Body> : null}
    </Screen>
  );
}
