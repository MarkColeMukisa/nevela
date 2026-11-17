import { useRef, useState } from "react";
import { View } from "react-native";

import { Choice } from "@/components/choice";
import { Body, Button, Field, Heading, Notice } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { recordActions } from "@/lib/actions";
import { fieldLabel, optionLabel, type FieldSpec, type Resource, type ResourceAction, type ResourceRecord } from "@/lib/resources";
import { spacing } from "@/lib/theme";

type Action = { key: string } & ResourceAction;

/** What the person fills in, as it is sent: text as typed, a yes/no, an option's value. */
type Values = Record<string, string | boolean | null>;

/** What Laravel wants for an action's field: a number as a number, an empty box as nothing. */
function sent(field: FieldSpec, value: string | boolean | null): unknown {
  if (value === null || value === "") return null;
  if ((field.kind === "int" || field.kind === "float") && typeof value === "string") return Number(value.replace(/,/g, ""));
  return value;
}

/**
 * What can be done to a record as it is now: Accept, Ready, Cancel. Each is a button, shown
 * to whoever holds its permission while it applies. One that asks a question asks it first,
 * and one that asks for something (a reason) asks for it here. Laravel does it, keeps it in
 * the record's history and tells the person the record belongs to.
 */
export function RecordActions({ resource, record, onDone }: { resource: Resource; record: ResourceRecord; onDone: (record: ResourceRecord | null, message: string) => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState<string | null>(null);
  const [values, setValues] = useState<Values>({});
  const [working, setWorking] = useState<string | null>(null);
  const [failed, setFailed] = useState<unknown>(null);
  // One at a time: a second press while one is on its way would be for a record that has moved.
  const busy = useRef(false);

  const actions = recordActions(user, resource, record);
  if (actions.length === 0) return null;

  const run = async (action: Action) => {
    if (busy.current) return;
    busy.current = true;
    setWorking(action.key);
    setFailed(null);
    try {
      const input: Record<string, unknown> = {};
      for (const [name, field] of Object.entries(action.fields ?? {})) {
        const value = sent(field, values[name] ?? null);
        if (value !== null) input[name] = value;
      }
      const done = await api.post<{ message?: string; record?: ResourceRecord | null }>(`/${resource.slug}/${encodeURIComponent(record.id)}/_actions/${action.key}`, { input });
      setOpen(null);
      setValues({});
      onDone(done.record ?? null, done.message ?? `${action.label}: done.`);
    } catch (caught) {
      setFailed(caught);
    } finally {
      busy.current = false;
      setWorking(null);
    }
  };

  const press = (action: Action) => {
    // Nothing to ask and nothing to confirm: done at once.
    if (!action.confirm && Object.keys(action.fields ?? {}).length === 0) {
      void run(action);
      return;
    }
    setFailed(null);
    setValues({});
    setOpen(action.key);
  };

  const issue = (name: string) => (failed instanceof ApiError ? failed.issue(name) : undefined);
  const opened = actions.find((action) => action.key === open);
  // A cancel is a step back: it reads as one.
  const backward = (action: Action) => /cancel|decline|reject|refuse/i.test(`${action.key} ${action.label}`);

  return (
    <View style={{ gap: spacing.sm }}>
      {failed && !(failed instanceof ApiError && failed.issues.length > 0) ? <Notice>{messageOf(failed)}</Notice> : null}
      {opened ? (
        <View style={{ gap: spacing.md }}>
          <Heading>{opened.label}</Heading>
          {opened.confirm ? <Body muted>{opened.confirm}</Body> : null}
          {Object.entries(opened.fields ?? {}).map(([name, field]) => {
            const label = `${fieldLabel(name, field)}${field.required === false ? " (optional)" : ""}`;
            if (field.kind === "enum") {
              return (
                <View key={name} style={{ gap: spacing.sm }}>
                  <Body small>{label}</Body>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}>
                    {(field.options ?? []).map((option) => (
                      <Choice key={option} label={optionLabel(field, option)} on={values[name] === option} onPress={() => setValues((now) => ({ ...now, [name]: option }))} />
                    ))}
                  </View>
                  {issue(name) ? <Notice>{issue(name)}</Notice> : null}
                </View>
              );
            }
            if (field.kind === "boolean") {
              return (
                <View key={name} style={{ flexDirection: "row", gap: spacing.sm, alignItems: "center" }}>
                  <Choice label={label} on={values[name] === true} onPress={() => setValues((now) => ({ ...now, [name]: now[name] !== true }))} />
                </View>
              );
            }
            return (
              <Field
                key={name}
                label={label}
                value={typeof values[name] === "string" ? (values[name] as string) : ""}
                onChangeText={(next) => setValues((now) => ({ ...now, [name]: next }))}
                multiline={field.kind === "text"}
                keyboardType={field.kind === "int" || field.kind === "float" ? "numeric" : "default"}
                error={issue(name)}
              />
            );
          })}
          <Button variant={backward(opened) ? "danger" : "primary"} label={opened.label} busy={working === opened.key} onPress={() => run(opened)} />
          <Button variant="secondary" label="Not now" disabled={working !== null} onPress={() => setOpen(null)} />
        </View>
      ) : (
        actions.map((action) => (
          <Button key={action.key} variant={backward(action) ? "danger" : "primary"} label={action.label} busy={working === action.key} disabled={working !== null} onPress={() => press(action)} />
        ))
      )}
    </View>
  );
}
