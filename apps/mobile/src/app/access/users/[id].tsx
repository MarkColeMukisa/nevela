import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";

import { Choice } from "@/components/choice";
import { Body, Button, Card, Field, Heading, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { can, personChanges, rolesToggled, type AccessUser, type RoleRow } from "@/lib/access";
import { spacing, text, useColors } from "@/lib/theme";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

/** One person: their name, address and roles, whether they can sign in, and a new password for them. "new" adds one. */
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const creating = id === "new";
  const { user: me } = useAuth();

  const loadPerson = useCallback(() => (creating ? Promise.resolve(null) : api.get<AccessUser>(`/_nevela/users/${id}`)), [creating, id]);
  const loadRoles = useCallback(() => api.get<{ data: RoleRow[] }>("/_nevela/roles"), []);
  const person = useLoaded(loadPerson);
  const roles = useLoaded(loadRoles);

  if (person.loading || roles.loading) return <Loading />;
  if (!creating && !person.data) return <Screen edges={["bottom"]}><Notice>{messageOf(person.error ?? new Error("No such person."))}</Notice></Screen>;
  if (!roles.data) return <Screen edges={["bottom"]}><Notice>{messageOf(roles.error ?? new Error("The roles couldn't be read."))}</Notice></Screen>;
  if (!can(me, creating ? "users.create" : "users.view")) return <Screen edges={["bottom"]}><Body muted>You don't have access to this.</Body></Screen>;

  return <Form person={person.data} roles={roles.data.data} />;
}

function Form({ person, roles }: { person: AccessUser | null; roles: RoleRow[] }) {
  const { user: me } = useAuth();
  const colors = useColors();
  const creating = person === null;
  const editable = creating ? can(me, "users.create") : can(me, "users.edit") && (person.isSelf || person.withinYours);

  const [name, setName] = useState(person?.name ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [password, setPassword] = useState("");
  const [held, setHeld] = useState<string[]>(person?.roles.map((role) => role.id) ?? []);
  const [active, setActive] = useState(person?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => setSaved(false), [name, email, password, held, active]);

  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);
  const named = ["name", "email", "password", "roles"].some((path) => issue(path));
  const dirty = creating || Object.keys(personChanges(person, { name, email, password, active, roles: held })).length > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if (creating) {
        const made = await api.post<AccessUser>("/_nevela/users", { name: name.trim(), email: email.trim(), password, roles: held, active });
        router.replace({ pathname: "/access/users/[id]", params: { id: made.id } });
        return;
      }
      await api.patch(`/_nevela/users/${person.id}`, personChanges(person, { name, email, password, active, roles: held }));
      router.back();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/_nevela/users/${person.id}`);
      router.back();
    } catch (caught) {
      setError(caught);
      setAsking(false);
    } finally {
      setBusy(false);
    }
  };

  const signOutEverywhere = async () => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/_nevela/users/${person.id}/sessions`);
      setSaved(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: creating ? "Add a person" : (person.name ?? "Person") }} />

      {error && !named ? <Notice>{messageOf(error)}</Notice> : null}
      {saved ? <Notice tone="success">Done.</Notice> : null}
      {!editable && !creating && !person.isSelf ? <Notice>This account allows more than yours does, so it isn't yours to change.</Notice> : null}

      <Field label="Name" value={name} onChangeText={setName} editable={editable} error={issue("name")} autoComplete="name" />
      <Field label="Email" value={email} onChangeText={setEmail} editable={editable} error={issue("email")} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {editable ? <Field label={creating ? "Password" : "A new password (leave empty to keep theirs)"} value={password} onChangeText={setPassword} secureTextEntry error={issue("password")} autoCapitalize="none" /> : null}

      <View style={{ gap: spacing.sm }}>
        <Heading>Roles</Heading>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
          {roles.map((role) => (
            <Choice key={role.id} label={role.name} on={held.includes(role.id)} disabled={!editable || (!role.withinYours && !held.includes(role.id))} onPress={() => setHeld((current) => rolesToggled(current, role.id))} />
          ))}
        </View>
        <Body muted small>What a role allows is set under Roles and permissions. A role that allows more than yours can't be given by you.</Body>
        {issue("roles") ? <Text style={{ color: colors.danger, fontSize: text.small }}>{issue("roles")}</Text> : null}
      </View>

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: text.body }}>Can sign in</Text>
            <Text style={{ color: colors.muted, fontSize: text.small }}>Switched off, they are signed out and can't sign in until it is on again.</Text>
          </View>
          <Switch accessibilityLabel="Can sign in" value={active} onValueChange={setActive} disabled={!editable || Boolean(person?.isSelf)} />
        </View>
      </Card>

      {editable ? <Button label={creating ? "Add" : "Save"} busy={busy} disabled={!dirty} onPress={save} /> : null}

      {!creating ? (
        <Card>
          <Row icon="phone-portrait-outline" label="Devices" value={person.devices === 0 ? "None" : String(person.devices)} detail={person.lastActiveAt ? `Last active ${ago(person.lastActiveAt)}` : null} />
          <Row icon="mail-outline" label="Email" value={person.emailVerified ? "Verified" : "Not verified"} />
          <Row icon="key-outline" label="Two-step sign-in" value={person.twoFactorEnabled ? "On" : "Off"} last />
        </Card>
      ) : null}

      {!creating && can(me, "users.edit") && person.withinYours && !person.isSelf && person.devices > 0 ? <Button variant="secondary" label="Sign them out everywhere" disabled={busy} onPress={signOutEverywhere} /> : null}

      {!creating && can(me, "users.delete") && person.withinYours && !person.isSelf ? (
        asking ? (
          <View style={{ gap: spacing.sm }}>
            <Body muted>Remove {person.name ?? person.email}? They can no longer sign in.</Body>
            <Button variant="danger" label="Yes, remove them" busy={busy} onPress={remove} />
            <Button variant="secondary" label="Keep them" disabled={busy} onPress={() => setAsking(false)} />
          </View>
        ) : (
          <Button variant="danger" label="Remove this person" onPress={() => setAsking(true)} />
        )
      ) : null}
    </Screen>
  );
}
