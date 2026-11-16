import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { ApiError, messageOf, SlowAnswerError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { site } from "@/lib/site";
import { spacing } from "@/lib/theme";

/** At least this long; the API checks the same, and the rest of its rules, before it accepts one. */
const MIN_LENGTH = 8;

/**
 * Create an account: a name, an email and a password. Where the API wants the email
 * proved first, the screen then asks for the code it sent, and signs the person in with it.
 *
 * The account the person gets is the one the API gives every new sign-up (its
 * `default_role`), so what they can do afterwards is the app owner's to decide.
 */
export default function SignUp() {
  const auth = useAuth();
  const [stage, setStage] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const address = email.trim();
  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);

  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  /** Signed in already, or off to sign in: the layout swaps this screen out when someone is signed in. */
  const toSignIn = () => router.replace({ pathname: "/sign-in", params: { email: address } });

  const create = () =>
    run(async () => {
      const result = await auth.register(name, address, password);
      if (result === "verify") {
        setStage("verify");
        setSent(true);
      } else if (result !== null) {
        // A second step on a brand-new account isn't something that happens; the sign-in screen knows what to do.
        toSignIn();
      }
    });

  const verify = () =>
    run(async () => {
      const result = await auth.verifyEmail(address, code);
      if (result !== null) toSignIn();
    });

  const again = async () => {
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await auth.resendVerification(address);
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(false);
    }
  };

  // An account that was made a moment ago by a request that then timed out: the answer to trying again.
  const exists = error instanceof ApiError && error.code === "USER_ALREADY_EXISTS";
  const slow = error instanceof SlowAnswerError;
  const refused = error instanceof ApiError && error.issues.length > 0;

  if (stage === "verify") {
    return (
      <Screen edges={["top", "bottom"]} centered>
        <View style={{ gap: spacing.xs }}>
          <Title>Check your email</Title>
          <Body muted>We sent a code to {address}. Enter it to finish creating your account.</Body>
        </View>

        {error ? <Notice>{messageOf(error)}</Notice> : sent ? <Notice tone="success">Code sent. It works for an hour.</Notice> : null}

        <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus returnKeyType="go" onSubmitEditing={verify} />
        <Button label="Verify and continue" busy={busy} disabled={code.trim() === ""} onPress={verify} />
        <Button variant="link" label="Send the code again" busy={sending} disabled={busy} onPress={again} />
        <Button variant="link" label="Use a different email" disabled={busy} onPress={() => { setStage("form"); setCode(""); setError(null); setSent(false); }} />
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]} centered>
      <View style={{ gap: spacing.xs }}>
        <Title>Create your account</Title>
        <Body muted>Join {site.name}. It takes a minute.</Body>
      </View>

      {slow ? (
        <Notice>The server took too long to answer. Your account may have been created: try signing in with the same email and password.</Notice>
      ) : error && !refused && !exists ? (
        <Notice>{messageOf(error)}</Notice>
      ) : null}
      {exists ? <Notice>An account with this email already exists.</Notice> : null}

      <Field label="Name" value={name} onChangeText={setName} error={issue("name")} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" />
      <Field label="Email" value={email} onChangeText={setEmail} error={issue("email")} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
      <Field label="Password" value={password} onChangeText={setPassword} error={issue("password")} secureTextEntry autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={create} />
      <Body muted small>At least {MIN_LENGTH} characters. A few unrelated words make a strong one.</Body>

      <Button label="Create account" busy={busy} disabled={name.trim() === "" || address === "" || password.length < MIN_LENGTH} onPress={create} />
      {exists || slow ? <Button variant="secondary" label="Sign in instead" disabled={busy} onPress={toSignIn} /> : null}
      <Button variant="link" label="Already have an account? Sign in" disabled={busy} onPress={toSignIn} />
    </Screen>
  );
}
