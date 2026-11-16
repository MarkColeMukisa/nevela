import { router } from "expo-router";
import { RefreshControl, View } from "react-native";

import { HomeHeader, NothingShared } from "@/components/home-header";
import { Card, Heading, Notice, Row, Screen } from "@/components/ui";
import { messageOf } from "@/lib/api";
import { iconFor } from "@/lib/icons";
import { useResources } from "@/lib/resources";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { loadInbox } from "@/app/notifications";

/**
 * A customer's home: a greeting, the bell, and what the app shares with them. None of the
 * staff view's counts and activity, which are about running the business.
 */
export function CustomerHome() {
  const { resources, loading, error } = useResources();
  const inbox = useLoaded(loadInbox);

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.refresh} />}>
      <HomeHeader unread={inbox.data?.unread ?? 0} />

      {error ? <Notice>{messageOf(error)}</Notice> : null}

      {resources.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Browse</Heading>
          <Card>
            {resources.map((resource, index) => (
              <Row
                key={resource.slug}
                icon={iconFor(resource.icon)}
                label={resource.pluralLabel}
                onPress={() => router.push({ pathname: "/r/[slug]", params: { slug: resource.slug } })}
                last={index === resources.length - 1}
              />
            ))}
          </Card>
        </View>
      ) : !loading ? (
        <NothingShared />
      ) : null}
    </Screen>
  );
}
