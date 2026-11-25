import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { Picture } from "@/components/pictures";
import { RecordActions } from "@/components/record-actions";
import { RecordHistory, type Step } from "@/components/record-history";
import { StatusTrail } from "@/components/status-trail";
import { Body, Button, Card, Heading, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { openFile } from "@/lib/files";
import { display, filesOf, thumb } from "@/lib/format";
import { applies, fieldLabel, forgetTitle, may, relatedTitles, titleOf, useResources, type Resource, type ResourceRecord } from "@/lib/resources";
import { spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

/** One record: every field as a person reads it, its pictures, its lines, and changing or deleting it. */
export default function RecordDetail() {
  const { slug, id } = useLocalSearchParams<{ slug: string; id: string }>();
  const { bySlug, byName, loading: describing } = useResources();
  const { user } = useAuth();
  const colors = useColors();
  const resource = bySlug(slug);

  const load = useCallback(() => api.get<ResourceRecord>(`/${slug}/${encodeURIComponent(id)}`), [slug, id]);
  const record = useLoaded(load);
  const [related, setRelated] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [said, setSaid] = useState<string | null>(null);

  // Its history, for a resource whose records move on through actions: who did what, when.
  const hasActions = Object.values(resource?.actions ?? {}).some((action) => (action.on ?? "record") === "record");
  const loadHistory = useCallback(async () => {
    if (!hasActions) return;
    try {
      const found = await api.get<{ data: Step[] }>(`/_nevela/history/${slug}/${encodeURIComponent(id)}`);
      setSteps(found.data);
    } catch {
      // Before its migration has run there is no history to show: the record is still there.
    }
  }, [hasActions, slug, id]);
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Back from the edit screen: show what was saved.
  const first = useRef(true);
  const { reload } = record;
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      reload();
      void loadHistory();
    }, [reload, loadHistory]),
  );

  // What each record this one belongs to is called.
  const data = record.data;
  useEffect(() => {
    if (!resource || !data) return;
    let live = true;
    (async () => {
      for (const [name, field] of Object.entries(resource.fields)) {
        const target = field.kind === "belongsTo" && field.target ? byName(field.target) : undefined;
        const value = data[name];
        if (!target || !value) continue;
        const found = await relatedTitles(target, [String(value)]);
        // Kept by the id as well as the field: a relation that is changed or cleared must not show the old title.
        if (live && found[String(value)]) setRelated((current) => ({ ...current, [`${name}:${String(value)}`]: found[String(value)] }));
      }
    })();
    return () => {
      live = false;
    };
  }, [resource, data, byName]);

  if (!resource) return describing ? <Loading /> : <Screen edges={["bottom"]}><Body muted>There is no such resource in this app.</Body></Screen>;
  if (record.loading) return <Loading />;
  // Deleted since it was read, perhaps by someone else: what is on screen is no longer a record.
  const gone = record.error instanceof ApiError && record.error.status === 404;
  if (!data || gone) {
    return (
      <Screen edges={["bottom"]}>
        <Stack.Screen options={{ title: resource.label }} />
        <Notice>{gone ? `This ${resource.label.toLowerCase()} no longer exists. It may have been deleted.` : messageOf(record.error)}</Notice>
      </Screen>
    );
  }

  const remove = async () => {
    setDeleting(true);
    setFailed(null);
    try {
      await api.delete(`/${resource.slug}/${encodeURIComponent(data.id)}`);
      forgetTitle(resource, data.id);
      // Opened by a link, there is no list behind this screen to go back to.
      if (router.canGoBack()) router.back();
      else router.replace({ pathname: "/r/[slug]", params: { slug: resource.slug } });
    } catch (caught) {
      setFailed(caught);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  };

  const fields = Object.entries(resource.fields).filter(([, field]) => applies(field, data));
  const facts = fields.filter(([, field]) => field.kind !== "file" && field.kind !== "text" && field.kind !== "json");
  const long = fields.filter(([name, field]) => (field.kind === "text" || field.kind === "json") && display(field, data[name]) !== "");
  const pictures = fields.flatMap(([name, field]) => (field.kind === "file" ? filesOf(name, field, data).map((file) => ({ name, file })) : []));
  const lines = resource.items ? byName(resource.items) : undefined;
  const stages = Object.entries(resource.fields).find(([name, field]) => /^(status|state|stage)$/i.test(name) && field.kind === "enum" && (field.options?.length ?? 0) >= 3);

  return (
    <Screen edges={["bottom"]} refreshControl={<RefreshControl refreshing={record.refreshing} onRefresh={() => { setSaid(null); void record.refresh(); void loadHistory(); }} />}>
      <Stack.Screen options={{ title: resource.label }} />

      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={{ color: colors.text, fontSize: text.heading + 4, fontWeight: "700" }}>{titleOf(resource, data)}</Text>
        {data.updatedAt ? <Body muted small>Changed {ago(data.updatedAt)}</Body> : null}
      </View>

      {failed ? <Notice>{messageOf(failed)}</Notice> : null}
      {record.error ? <Notice>Couldn't refresh this {resource.label.toLowerCase()}, so it may have changed since. {messageOf(record.error)}</Notice> : null}

      {stages && typeof data[stages[0]] === "string" ? <StatusTrail field={stages[1]} value={data[stages[0]] as string} /> : null}

      {said ? <Notice tone="success">{said}</Notice> : null}
      <RecordActions
        resource={resource}
        record={data}
        onDone={(_, message) => {
          setSaid(message);
          void record.reload();
          void loadHistory();
        }}
      />

      {pictures.some(({ file }) => thumb(file)) ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {pictures.map(({ name, file }, index) => (thumb(file) ? <Picture key={`${name}-${index}`} file={file} size={pictures.length === 1 ? 220 : 160} rendition="card" /> : null))}
        </ScrollView>
      ) : null}

      <Card>
        {facts.map(([name, field], index) => {
          const target = field.kind === "belongsTo" && field.target ? byName(field.target) : undefined;
          const value = data[name];
          const shown = field.kind === "belongsTo" ? related[`${name}:${String(value ?? "")}`] ?? "" : display(field, value);
          return (
            <Row
              key={name}
              label={fieldLabel(name, field)}
              value={shown || "—"}
              last={index === facts.length - 1}
              onPress={target && value && may(user, target, "view") ? () => router.push({ pathname: "/r/[slug]/[id]", params: { slug: target.slug, id: String(value) } }) : undefined}
            />
          );
        })}
      </Card>

      {long.map(([name, field]) => (
        <View key={name} style={{ gap: spacing.sm }}>
          <Heading>{fieldLabel(name, field)}</Heading>
          <Body>{display(field, data[name])}</Body>
        </View>
      ))}

      {pictures.filter(({ file }) => !thumb(file)).length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Heading>Files</Heading>
          <Card>
            {pictures.filter(({ file }) => !thumb(file)).map(({ name, file }, index, all) => (
              <Row
                key={`${name}-${index}`}
                icon="document-outline"
                label={file.name}
                detail={fieldLabel(name, resource.fields[name])}
                last={index === all.length - 1}
                onPress={() => {
                  setFailed(null);
                  openFile(resource.slug, data.id, name, file).catch(setFailed);
                }}
              />
            ))}
          </Card>
        </View>
      ) : null}

      {lines && Array.isArray(data.items) ? <Lines resource={lines} parent={resource} items={data.items as ResourceRecord[]} editable={may(user, resource, "edit")} /> : null}

      <RecordHistory resource={resource} steps={steps} you={user ? String(user.id) : null} />

      {may(user, resource, "edit") ? <Button label="Edit" icon="create-outline" onPress={() => router.push({ pathname: "/r/[slug]/[id]/edit", params: { slug: resource.slug, id: data.id } })} /> : null}

      {may(user, resource, "delete") ? (
        confirming ? (
          <View style={{ gap: spacing.sm }}>
            <Body muted small>It goes to the trash, where it can be restored: Account → Trash.</Body>
            <Button variant="danger" label={`Yes, delete this ${resource.label.toLowerCase()}`} busy={deleting} onPress={remove} />
            <Button variant="secondary" label="Keep it" disabled={deleting} onPress={() => setConfirming(false)} />
          </View>
        ) : (
          <Button variant="danger" label="Delete" icon="trash-outline" onPress={() => setConfirming(true)} />
        )
      ) : null}
    </Screen>
  );
}

/** A record's lines, such as an order's items: read here, edited in the dashboard. */
function Lines({ resource, parent, items, editable }: { resource: Resource; parent: Resource; items: ResourceRecord[]; editable: boolean }) {
  const { byName } = useResources();
  const [related, setRelated] = useState<Record<string, string>>({});

  // The fields worth a line: everything but the one that points back at the parent.
  const fields = Object.entries(resource.fields).filter(([, field]) => !(field.kind === "belongsTo" && field.target === parent.name) && field.kind !== "file" && field.kind !== "json" && field.kind !== "text");
  const lead = fields.find(([, field]) => field.kind === "belongsTo") ?? fields[0];

  useEffect(() => {
    let live = true;
    (async () => {
      for (const [name, field] of fields) {
        const target = field.kind === "belongsTo" && field.target ? byName(field.target) : undefined;
        if (!target) continue;
        const found = await relatedTitles(target, items.map((item) => String(item[name] ?? "")));
        if (live) setRelated((current) => ({ ...current, ...Object.fromEntries(Object.entries(found).map(([id, title]) => [`${name}:${id}`, title])) }));
      }
    })();
    return () => {
      live = false;
    };
    // The lines themselves decide what to look up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, byName]);

  const show = (name: string, item: ResourceRecord) => {
    const field = resource.fields[name];
    return field.kind === "belongsTo" ? related[`${name}:${String(item[name] ?? "")}`] ?? "" : display(field, item[name]);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Heading>{resource.pluralLabel}</Heading>
      {items.length === 0 ? (
        <Body muted>None.</Body>
      ) : (
        <Card>
          {items.map((item, index) => (
            <Row
              key={item.id ?? index}
              label={(lead ? show(lead[0], item) : "") || `${resource.label} ${index + 1}`}
              detail={fields.filter(([name]) => name !== lead?.[0]).map(([name, field]) => `${fieldLabel(name, field)} ${show(name, item)}`).join(" · ")}
              last={index === items.length - 1}
            />
          ))}
        </Card>
      )}
      {editable ? <Body muted small>Lines are added and changed in the dashboard.</Body> : null}
    </View>
  );
}
