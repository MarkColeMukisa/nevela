import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { SecondStep } from "@/components/second-step";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { ApiError, messageOf } from "@/lib/api";
import { useAuth, type Challenge } from "@/lib/auth";
import { spacing } from "@/lib/theme";

/**
 * A forgotten password: a code by email, then the code and a new password. Every sign-in the
 * account had is ended, in case someone else had it, and this phone is signed in with the new
 * password, through the second step where the account has one.
 *
 * The answer to "send me a code" is the same whether or not the address has an account, so
 * nobody can find out from here who has one.
 */
export default function ForgotPassword() {
  const auth = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  const address = email.trim();
  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.forgotPassword(address);
      setSent(address);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!sent) return;
    setBusy(true);
    setError(null);
    try {
      await auth.resetPassword(sent, code, password);
      // Signed in here with the new password; the layout takes the app from there.
      setChallenge(await auth.signIn(sent, password));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const sendAgain = async () => {
    if (!sent) return;
    setAgain(true);
    setError(null);
    try {
      await auth.forgotPassword(sent);
      setResent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setAgain(false);
    }
  };

  if (challenge) {
    return <SecondStep challenge={challenge} onCancel={() => router.replace("/sign-in")} />;
  }

  return (
    <Screen edges={["top", "bottom"]} centered>
      <View style={{ gap: spacing.xs }}>
        <Title>Forgot your password?</Title>
        <Body muted>{sent ? `If ${sent} has an account, we sent it a code. Enter it with a new password. It works once, for an hour.` : "We'll email you a code to choose a new one with."}</Body>
      </View>

      {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : resent ? <Notice tone="success">Code sent again.</Notice> : null}

      {sent ? (
        <>
          <Field label="Code" value={code} onChangeText={setCode} error={issue("code")} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus returnKeyType="next" />
          <Field label="New password" value={password} onChangeText={setPassword} error={issue("newPassword")} secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={reset} />
          <Button label="Set the new password" busy={busy} disabled={code.trim() === "" || password === ""} onPress={reset} />
          <Button variant="link" label="Send the code again" busy={again} disabled={busy} onPress={sendAgain} />
          <Button variant="link" label="Use a different email" disabled={busy} onPress={() => { setSent(null); setCode(""); setPassword(""); setResent(false); setError(null); }} />
        </>
      ) : (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} error={issue("email")} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="username" autoFocus returnKeyType="go" onSubmitEditing={send} />
          <Button label="Email me a code" busy={busy} disabled={address === ""} onPress={send} />
        </>
      )}

      <Button variant="link" label="Back to sign in" disabled={busy} onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))} />
    </Screen>
  );
}
