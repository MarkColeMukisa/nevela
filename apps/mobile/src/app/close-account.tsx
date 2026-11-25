import { router } from "expo-router";
import { useState } from "react";

import { Body, Button, Field, Notice, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Close your own account, as the dashboard's Account page does: the one thing here a person
 * can't take back by themselves, so it says what closing means and asks for the password.
 *
 * The app stores ask for this too: an app where people make an account has to let them
 * close it from the app.
 */
export default function CloseAccount() {
  const { user, signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [closed, setClosed] = useState(false);

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/close", { password });
      setClosed(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  // Every sign-in has ended on the API already. Signing out here forgets this one on the phone.
  if (closed) {
    return (
      <Screen edges={["bottom"]}>
        <Notice tone="success">Your account is closed, and you have been signed out on every device. An email says so too.</Notice>
        <Body muted>To have it back, ask an administrator: it can be restored with everything it had.</Body>
        <Button label="Done" onPress={() => void signOut()} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Body>You won't be able to sign in, and {user?.email ?? "your email"} can't be used to make a new account.</Body>
      <Body muted>Nothing is erased: an administrator can restore the account as it was, or remove it for good.</Body>
      {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : null}
      <Field
        label="Your password"
        value={password}
        onChangeText={setPassword}
        error={error instanceof ApiError ? error.issue("password") : undefined}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Body muted small>Signed up with Google or GitHub and never chose a password? Sign out, then choose one with "Forgot your password?" on the sign-in screen.</Body>
      <Button variant="danger" label="Close my account" busy={busy} disabled={password === ""} onPress={close} />
      <Button variant="secondary" label="Keep it" disabled={busy} onPress={() => router.back()} />
    </Screen>
  );
}
