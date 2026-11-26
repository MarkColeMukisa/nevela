import { useCallback, useState } from "react";
import { RefreshControl, View } from "react-native";

import { Body, Button, Card, Field, Heading, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { can } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

interface Block {
  id: string;
  address: string;
  reason: string;
  note: string | null;
  blockedAt: string;
  until: string | null;
}

type Loaded = { data: Block[]; exempt: string[] } | "migrate";

const WHY: Record<string, string> = { scanner: "Probing for files", limit: "Too many requests", manual: "Blocked by hand" };
const LENGTHS = [
  { minutes: 60, label: "An hour" },
  { minutes: 1440, label: "A day" },
  { minutes: 0, label: "Until cleared" },
];

/**
 * The addresses turned away before they reach the app, as the dashboard's Blocked addresses
 * page has them: blocked for a while after too many probes or requests, or by hand.
 */
export default function BlockedAddresses() {
  const { user } = useAuth();
  const [address, setAddress] = useState("");
  const [minutes, setMinutes] = useState(1440);
  const [note, setNote] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    try {
      return await api.get<{ data: Block[]; exempt: string[] }>("/_nevela/blocked-addresses");
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) return "migrate";
      throw caught;
    }
  }, []);
  const loaded = useLoaded(load);

  const act = async (key: string, run: () => Promise<unknown>, done: string) => {
    setWorking(key);
    setError(null);
    setSaid(null);
    try {
      await run();
      setSaid(done);
      await loaded.reload();
      return true;
    } catch (caught) {
      setError(caught);
      return false;
    } finally {
      setWorking(null);
    }
  };

  if (!can(user, "blocked_addresses.view")) return <Screen edges={["bottom"]}><Body muted>You don't have access to the block list.</Body></Screen>;
  if (loaded.loading) return <Loading />;
  if (loaded.data === "migrate") {
    return (
      <Screen edges={["bottom"]}>
        <Heading>The block list isn't set up yet</Heading>
        <Body muted>Run nevela migrate on the server, and from then on addresses that keep probing are blocked for a while, and can be blocked here.</Body>
      </Screen>
    );
  }

  const blocks = loaded.data?.data ?? [];
  const shown = error ?? loaded.error;
  const issue = error instanceof ApiError ? error.issue("address") : undefined;

  const block = async () => {
    const typed = address.trim();
    const done = await act("block", () => api.post("/_nevela/blocked-addresses", { address: typed, ...(minutes > 0 ? { minutes } : {}), ...(note.trim() ? { note: note.trim() } : {}) }), `${typed} is blocked.`);
    if (done) {
      setAddress("");
      setNote("");
    }
  };

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={loaded.refreshing} onRefresh={() => { setSaid(null); loaded.refresh(); }} />}>
      <Body muted>Addresses turned away before they reach the app: for a while after too many probes or requests, or until cleared when blocked by hand.</Body>
      {shown && !issue ? <Notice>{messageOf(shown)}</Notice> : null}
      {said ? <Notice tone="success">{said}</Notice> : null}

      {can(user, "blocked_addresses.create") ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Block an address</Heading>
          <Field label="Address" placeholder="203.0.113.7" value={address} onChangeText={setAddress} error={issue} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            {LENGTHS.map((length) => (
              <View key={length.label} style={{ flex: 1 }}>
                <Button variant={minutes === length.minutes ? "primary" : "secondary"} label={length.label} onPress={() => setMinutes(length.minutes)} />
              </View>
            ))}
          </View>
          <Field label="Why (optional)" placeholder="Keeps trying passwords" value={note} onChangeText={setNote} maxLength={255} />
          <Button label="Block" busy={working === "block"} disabled={working !== null || address.trim() === ""} onPress={block} />
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Heading>Blocked now</Heading>
        {blocks.length === 0 ? (
          <Body muted>No address is blocked.</Body>
        ) : (
          <Card>
            {blocks.map((entry, index) => (
              <View key={entry.id}>
                <Row
                  icon="ban-outline"
                  label={entry.address}
                  detail={[WHY[entry.reason] ?? entry.reason, entry.note, entry.until ? `until ${new Date(entry.until).toLocaleString()}` : "until cleared", `blocked ${ago(entry.blockedAt)}`].filter(Boolean).join(" · ")}
                  last={index === blocks.length - 1 && !can(user, "blocked_addresses.delete")}
                />
                {can(user, "blocked_addresses.delete") ? (
                  <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
                    <Button variant="secondary" label="Clear" busy={working === entry.id} disabled={working !== null} onPress={() => act(entry.id, () => api.delete(`/_nevela/blocked-addresses/${encodeURIComponent(entry.id)}`), `${entry.address} can reach the app again.`)} />
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </View>

      <Body muted small>
        {(loaded.data?.exempt.length ?? 0) > 0 ? `Never blocked: the server itself, and ${loaded.data?.exempt.join(", ")}.` : "To keep an office or a monitor from ever being blocked, list it in NEVELA_EXEMPT on the server."}
      </Body>
    </Screen>
  );
}
