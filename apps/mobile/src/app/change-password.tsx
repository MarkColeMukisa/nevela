import { router } from "expo-router";
import { useState } from "react";

import { Body, Button, Field, Notice, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";

/** At least this long; the API checks the same, and the rest of its rules, before it accepts one. */
const MIN_LENGTH = 8;

export default function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", { currentPassword: current, newPassword: next });
      setDone(true);
      setCurrent("");
      setNext("");
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen edges={["bottom"]}>
        <Notice tone="success">Your password has been changed. Other devices stay signed in; sign them out under Settings → Devices if you need to.</Notice>
        <Button label="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : null}
      <Field label="Current password" value={current} onChangeText={setCurrent} error={issue("currentPassword")} secureTextEntry autoComplete="current-password" textContentType="password" />
      <Field label="New password" value={next} onChangeText={setNext} error={issue("newPassword")} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Body muted small>At least {MIN_LENGTH} characters. A few unrelated words make a strong one.</Body>
      <Button label="Change password" busy={busy} disabled={current === "" || next.length < MIN_LENGTH} onPress={save} />
    </Screen>
  );
}
