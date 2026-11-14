import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Body, Button, Card, Heading, Loading, Notice, Row, Screen, Title } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

/** The dashboard's bell, as Laravel serves it (`GET _nevela/notifications`). */
interface Inbox {
  items: { id: string; title: string; body: string | null; tone: "info" | "warning"; count: number; read: boolean; at: string }[];
  unread: number;
  /** What is wrong with the app right now. Administrators only. */
  conditions: { id: string; title: string; body: string; tone: "info" | "warning" }[];
}

const loadInbox = () => api.get<Inbox>("/_nevela/notifications");

/** Home: who is signed in, what needs attention, and what has happened since they last looked. */
export default function Home() {
  const { user } = useAuth();
  const inbox = useLoaded(loadInbox);
  const [failed, setFailed] = useState<unknown>(null);

  if (inbox.loading) return <Loading />;

  const markAllRead = async () => {
    setFailed(null);
    try {
      await api.post("/_nevela/notifications/read");
    } catch (caught) {
      setFailed(caught);
    }
    await inbox.reload();
  };

  const first = user?.name?.trim().split(/\s+/)[0];

  return (
    <Screen refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.refresh} />}>
      <View style={{ gap: spacing.xs }}>
        <Title>{first ? `Hello, ${first}` : "Hello"}</Title>
        <Body muted>{inbox.data && inbox.data.unread > 0 ? `${inbox.data.unread} new since you last looked.` : "You're up to date."}</Body>
      </View>

      {inbox.error ?? failed ? <Notice>{messageOf(inbox.error ?? failed)}</Notice> : null}

      {inbox.data && inbox.data.conditions.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Needs attention</Heading>
          <Card>
            {inbox.data.conditions.map((condition, index, all) => (
              <Row key={condition.id} icon={condition.tone === "warning" ? "warning-outline" : "information-circle-outline"} label={condition.title} detail={condition.body} last={index === all.length - 1} />
            ))}
          </Card>
        </View>
      ) : null}

      {inbox.data ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Notifications</Heading>
          {inbox.data.items.length === 0 ? (
            <Body muted>Nothing yet. A form sent in, a new account or a change to how you sign in will show here.</Body>
          ) : (
            <Card>
              {inbox.data.items.map((item, index, all) => (
                <Row
                  key={item.id}
                  icon={item.read ? "ellipse-outline" : "ellipse"}
                  label={item.count > 1 ? `${item.title} (${item.count})` : item.title}
                  detail={[item.body, ago(item.at)].filter(Boolean).join(" · ")}
                  last={index === all.length - 1}
                />
              ))}
            </Card>
          )}
          {inbox.data.unread > 0 ? <Button variant="link" label="Mark all as read" onPress={markAllRead} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
