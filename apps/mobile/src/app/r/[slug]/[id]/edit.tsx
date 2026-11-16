import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";

import { RecordForm } from "@/components/record-form";
import { Body, Loading, Notice, Screen } from "@/components/ui";
import { api, messageOf } from "@/lib/api";
import { forgetTitle, useResources, type ResourceRecord } from "@/lib/resources";
import { useLoaded } from "@/lib/use-loaded";

/** Change a record. It is read again first, so the form starts from what is saved now. */
export default function EditRecord() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { bySlug, loading } = useResources();
  const resource = bySlug(slug);

  const load = useCallback(() => api.get<ResourceRecord>(`/${slug}/${encodeURIComponent(id)}`), [slug, id]);
  const record = useLoaded(load);

  if (!resource) return loading ? <Loading /> : <Screen edges={["bottom"]}><Body muted>There is no such resource in this app.</Body></Screen>;
  if (record.loading) return <Loading />;

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: `Edit ${resource.label.toLowerCase()}` }} />
      {record.data ? (
        <RecordForm
          resource={resource}
          record={record.data}
          onSaved={(saved) => {
            forgetTitle(resource, saved.id);
            if (router.canGoBack()) router.back();
            else router.replace({ pathname: "/r/[slug]/[id]", params: { slug: resource.slug, id: saved.id } });
          }}
        />
      ) : (
        <Notice>{messageOf(record.error)}</Notice>
      )}
    </Screen>
  );
}
