import { router } from "expo-router";
import { useState } from "react";
import { RefreshControl, View } from "react-native";

import { HomeHeader, NothingShared } from "@/components/home-header";
import { ShopHome } from "@/components/shop-home";
import { Card, Heading, Notice, Row, Screen } from "@/components/ui";
import { messageOf } from "@/lib/api";
import { useCatalogue } from "@/lib/cart";
import { iconFor } from "@/lib/icons";
import { useResources } from "@/lib/resources";
import { spacing } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { loadInbox } from "@/app/notifications";

/**
 * A customer's home: the shop, when the app has one they may buy from (lib/shop.ts), and
 * otherwise a list of what the app shares with them.
 */
export function CustomerHome() {
  // The shop, or for someone not signed in, what of it anyone may browse.
  const shop = useCatalogue();
  return shop ? <ShopHome shop={shop} /> : <Browse />;
}

/**
 * A greeting, the bell, and what the app shares with them. None of the staff view's counts
 * and activity, which are about running the business.
 */
function Browse() {
  const { resources, loading, error, reload } = useResources();
  const inbox = useLoaded(loadInbox);
  const [refreshing, setRefreshing] = useState(false);

  // What there is to browse is asked for again as well: after a failed first try it would otherwise stay empty.
  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([inbox.refresh(), reload()]);
    setRefreshing(false);
  };

  return (
    <Screen inTabs refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
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
