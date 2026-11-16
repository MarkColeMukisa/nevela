import { router, Stack, useLocalSearchParams } from "expo-router";

import { RecordForm } from "@/components/record-form";
import { Body, Loading, Screen } from "@/components/ui";
import { useResources } from "@/lib/resources";

/** A new record of a resource. Saved, it opens in place of this form. */
export default function NewRecord() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { bySlug, loading } = useResources();
  const resource = bySlug(slug);

  if (!resource) return loading ? <Loading /> : <Screen edges={["bottom"]}><Body muted>There is no such resource in this app.</Body></Screen>;

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: `New ${resource.label.toLowerCase()}` }} />
      <RecordForm resource={resource} onSaved={(saved) => router.replace({ pathname: "/r/[slug]/[id]", params: { slug: resource.slug, id: saved.id } })} />
    </Screen>
  );
}
