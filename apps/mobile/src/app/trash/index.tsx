import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { RefreshControl } from "react-native";

import { Body, Card, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { keepsFor, type TrashResource } from "@/lib/activity";
import { useLoaded } from "@/lib/use-loaded";

interface Answer {
  days: number | null;
  resources: TrashResource[];
}

const load = () => api.get<Answer>("/_nevela/trash");

/** What has been deleted, by kind: how much of each is in the trash, and how long it is kept. */
export default function Trash() {
  const trash = useLoaded(load);

  // Looked at again when the screen is come back to: something was restored or removed there.
  const first = useRef(true);
  const { reload } = trash;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
    }, [reload]),
  );

  if (trash.loading) return <Loading />;
  const resources = trash.data?.resources ?? [];

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={trash.refreshing} onRefresh={trash.refresh} />}>
      {trash.error ? <Notice>{messageOf(trash.error)}</Notice> : null}
      <Body muted>{keepsFor(trash.data?.days)}</Body>
      {resources.length === 0 && !trash.error ? (
        <Body muted>Nothing here can be restored.</Body>
      ) : (
        <Card>
          {resources.map((resource, index) => (
            <Row
              key={resource.slug}
              icon="trash-outline"
              label={resource.pluralLabel}
              value={resource.count === 0 ? "Empty" : String(resource.count)}
              onPress={() => router.push({ pathname: "/trash/[slug]", params: { slug: resource.slug, title: resource.pluralLabel } })}
              last={index === resources.length - 1}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}
