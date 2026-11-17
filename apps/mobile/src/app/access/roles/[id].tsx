import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { Choice } from "@/components/choice";
import { Body, Button, Card, Field, Heading, Loading, Notice, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { actionName, actionsOf, can, featureToggled, grantsFrom, heldOf, keyOf, roleChanges, toggled, usesPatterns, type Catalog, type Feature, type RoleRow } from "@/lib/access";
import { spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";

/** One role: its name, and a switch for each thing it may do to each part of the app. "new" makes one. */
export default function RoleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === "new";
  const { user: me } = useAuth();

  const loadRole = useCallback(() => (creating ? Promise.resolve(null) : api.get<RoleRow>(`/_nevela/roles/${id}`)), [creating, id]);
  const loadCatalog = useCallback(() => api.get<Catalog>("/_nevela/permissions"), []);
  const role = useLoaded(loadRole);
  const catalog = useLoaded(loadCatalog);

  if (role.loading || catalog.loading) return <Loading />;
  if (!creating && !role.data) return <Screen edges={["bottom"]}><Notice>{messageOf(role.error ?? new Error("No such role."))}</Notice></Screen>;
  if (!catalog.data) return <Screen edges={["bottom"]}><Notice>{messageOf(catalog.error ?? new Error("The permissions couldn't be read."))}</Notice></Screen>;
  if (!can(me, creating ? "roles.create" : "roles.view")) return <Screen edges={["bottom"]}><Body muted>You don't have access to this.</Body></Screen>;

  return <Form role={role.data} catalog={catalog.data} />;
}

function Form({ role, catalog }: { role: RoleRow | null; catalog: Catalog }) {
  const { user: me } = useAuth();
  const colors = useColors();
  const creating = role === null;
  const everything = role?.isAdmin === true;
  // Whoever edits can give no more than they hold, and can't reshape a role that allows more than theirs does.
  const editable = !everything && (creating ? can(me, "roles.create") : can(me, "roles.edit") && role.withinYours);
  const mayGive = (key: string) => can(me, key);

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [asking, setAsking] = useState(false);

  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);
  const named = ["name", "description", "grants"].some((path) => issue(path));
  const dirty = creating || Object.keys(roleChanges(role, { name, description, permissions })).length > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { name: name.trim(), description: description.trim() || null, grants: grantsFrom(permissions) };
      if (creating) {
        const made = await api.post<RoleRow>("/_nevela/roles", body);
        router.replace({ pathname: "/access/roles/[id]", params: { id: made.id } });
        return;
      }
      await api.patch(`/_nevela/roles/${role.id}`, roleChanges(role, { name, description, permissions }));
      router.back();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!role) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/_nevela/roles/${role.id}`);
      router.back();
    } catch (caught) {
      setError(caught);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: creating ? "Make a role" : role.name }} />

      {error && !named ? <Notice>{messageOf(error)}</Notice> : null}
      {everything ? <Notice tone="success">This role allows everything, and always will. Make another role for less.</Notice> : null}
      {!everything && !creating && !editable ? <Notice>This role allows more than yours does, so it isn't yours to change.</Notice> : null}

      <Field label="Name" value={name} onChangeText={setName} editable={editable && !role?.isSystem} error={issue("name")} autoCapitalize="characters" />
      <Field label="What it is for" value={description} onChangeText={setDescription} editable={editable} error={issue("description")} />

      {!everything ? (
        <View style={{ gap: spacing.lg }}>
          {!creating && usesPatterns(role) ? <Body muted small>This role is written with patterns, such as products.*. Saving here writes out each permission it comes to.</Body> : null}
          {catalog.modules.map((module) =>
            module.groups.map((group) => (
              <View key={`${module.key}-${group.key}`} style={{ gap: spacing.sm }}>
                <Heading>{group.name}</Heading>
                {group.features.map((feature) => (
                  <FeatureCard key={feature.key} feature={feature} permissions={permissions} editable={editable} mayGive={mayGive} onChange={setPermissions} />
                ))}
              </View>
            )),
          )}
        </View>
      ) : null}

      {issue("grants") ? <Text style={{ color: colors.danger, fontSize: text.small }}>{issue("grants")}</Text> : null}
      {editable ? <Button label={creating ? "Make the role" : "Save"} busy={busy} disabled={!dirty} onPress={save} /> : null}

      {!creating && can(me, "roles.delete") && role.withinYours && !role.isSystem ? (
        asking ? (
          <View style={{ gap: spacing.sm }}>
            <Body muted>Delete the {role.name} role?{role.users > 0 ? ` ${role.users} people hold it: give them another first.` : ""}</Body>
            <Button variant="danger" label="Yes, delete it" busy={busy} onPress={remove} />
            <Button variant="secondary" label="Keep it" disabled={busy} onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button variant="danger" label="Delete this role" onPress={() => setAsking(true)} />
        )
      ) : null}
    </Screen>
  );
}

function FeatureCard({ feature, permissions, editable, mayGive, onChange }: { feature: Feature; permissions: string[]; editable: boolean; mayGive: (key: string) => boolean; onChange: (permissions: string[]) => void }) {
  const colors = useColors();
  const held = heldOf(permissions, feature);
  const all = held === feature.actions.length;
  return (
    <Card>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Text style={{ flex: 1, color: colors.text, fontSize: text.body, fontWeight: "600" }}>{feature.name}</Text>
          <Text style={{ color: colors.muted, fontSize: text.small }}>{held === 0 ? "None" : all ? "All" : `${held} of ${feature.actions.length}`}</Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {actionsOf(feature).map((action) => {
            const key = keyOf(feature.key, action);
            const on = permissions.includes(key);
            return <Choice key={action} label={actionName(feature, action)} on={on} disabled={!editable || (!on && !mayGive(key))} onPress={() => onChange(toggled(permissions, key, !on))} />;
          })}
          {editable ? <Choice label={all ? "None" : "All"} on={false} disabled={!all && !feature.actions.some((action) => mayGive(keyOf(feature.key, action)))} onPress={() => onChange(featureToggled(permissions, feature, !all, mayGive))} /> : null}
        </View>
      </View>
    </Card>
  );
}
