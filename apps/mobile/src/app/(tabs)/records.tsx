import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { Body, Card, Heading, Loading, Notice, Row, Screen, Title } from "@/components/ui";
import { messageOf } from "@/lib/api";
import { iconFor } from "@/lib/icons";
import { useResources, type Resource } from "@/lib/resources";
import { spacing } from "@/lib/theme";

/** Records: every resource you may see, grouped as the dashboard's sidebar groups them. */
export default function Records() {
  const { resources, loading, error, reload } = useResources();
  const [refreshing, setRefreshing] = useState(false);

  if (loading && resources.length === 0) return <Loading />;

  const groups = new Map<string, Resource[]>();
  for (const resource of resources) {
    const group = resource.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), resource]);
  }

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} />}>
      <Title>Records</Title>
      {error ? <Notice>{messageOf(error)}</Notice> : null}
      {resources.length === 0 && !error ? <Body muted>Nothing here yet. A resource made with nevela resource shows up here, for everyone whose role may view it.</Body> : null}

      {[...groups.entries()].map(([group, members]) => (
        <View key={group} style={{ gap: spacing.sm }}>
          {group ? <Heading>{group}</Heading> : null}
          <Card>
            {members.map((resource, index) => (
              <Row
                key={resource.slug}
                icon={iconFor(resource.icon)}
                label={resource.pluralLabel}
                onPress={() => router.push({ pathname: "/r/[slug]", params: { slug: resource.slug } })}
                last={index === members.length - 1}
              />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
