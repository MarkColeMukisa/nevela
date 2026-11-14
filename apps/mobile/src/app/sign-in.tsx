import { useEffect, useState } from "react";
import { View } from "react-native";

import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { ApiError, messageOf } from "@/lib/api";
import { signInMethods, useAuth, type Challenge, type SecondStepMethod } from "@/lib/auth";
import { site } from "@/lib/site";
import { spacing } from "@/lib/theme";

/**
 * Sign in: a password, or a code sent by email when the API has that switched on, and
 * then the second step for an account that has one.
 *
 * Signing in with Google, GitHub, a passkey or an emailed link is the dashboard's for
 * now: each ends at a web address, which a phone app has to be taught to open.
 */
export default function SignIn() {
  const auth = useAuth();
  const [way, setWay] = useState<"password" | "code">("password");
  const [emailCode, setEmailCode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    signInMethods().then((methods) => setEmailCode(methods.emailCode));
  }, []);

  /** Run one step, showing what went wrong if it did. */
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

  if (challenge) {
    return <SecondStep challenge={challenge} onCancel={() => setChallenge(null)} />;
  }

  const issue = (path: string) => (error instanceof ApiError ? error.issue(path) : undefined);
  const address = email.trim();

  return (
    <Screen edges={["top", "bottom"]} centered>
      <View style={{ gap: spacing.xs }}>
        <Title>{site.name}</Title>
        <Body muted>{way === "password" ? "Sign in to continue." : codeSent ? `Enter the code we sent to ${address}.` : "We'll email you a code to sign in with."}</Body>
      </View>

      {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : null}

      <Field label="Email" value={email} onChangeText={setEmail} error={issue("email")} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="username" editable={!codeSent} returnKeyType="next" />

      {way === "password" ? (
        <>
          <Field label="Password" value={password} onChangeText={setPassword} error={issue("password")} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => run(async () => setChallenge(await auth.signIn(address, password)))} />
          <Button label="Sign in" busy={busy} disabled={address === "" || password === ""} onPress={() => run(async () => setChallenge(await auth.signIn(address, password)))} />
        </>
      ) : codeSent ? (
        <>
          <Field label="Code" value={code} onChangeText={setCode} error={issue("code")} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
          <Button label="Sign in" busy={busy} disabled={code.trim() === ""} onPress={() => run(async () => setChallenge(await auth.signInWithCode(address, code)))} />
          <Button variant="link" label="Use a different email" onPress={() => { setCodeSent(false); setCode(""); setError(null); }} />
        </>
      ) : (
        <Button label="Email me a code" busy={busy} disabled={address === ""} onPress={() => run(async () => { await auth.sendEmailCode(address); setCodeSent(true); })} />
      )}

      {emailCode ? (
        <Button variant="link" label={way === "password" ? "Sign in with an emailed code instead" : "Sign in with a password instead"} onPress={() => { setWay(way === "password" ? "code" : "password"); setCodeSent(false); setCode(""); setError(null); }} />
      ) : null}
    </Screen>
  );
}

const SECOND_STEPS: Record<SecondStepMethod, { label: string; prompt: string; choose: string }> = {
  totp: { label: "Code", prompt: "Enter the code from your authenticator app.", choose: "Use my authenticator app" },
  email: { label: "Code", prompt: "Enter the code we emailed you.", choose: "Email me a code" },
  backup: { label: "Backup code", prompt: "Enter one of your backup codes. Each works once.", choose: "Use a backup code" },
};

/** The second step of a sign-in: a code from an app, from an email, or a backup code. */
function SecondStep({ challenge, onCancel }: { challenge: Challenge; onCancel: () => void }) {
  const auth = useAuth();
  const [method, setMethod] = useState<SecondStepMethod>(challenge.methods[0] ?? "totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const choose = async (next: SecondStepMethod) => {
    setError(null);
    setCode("");
    setMethod(next);
  };

  // An emailed code has to be asked for: on choosing it, and at the start for an
  // account whose only second step it is.
  const { sendSecondStepCode } = auth;
  useEffect(() => {
    if (method !== "email") return;
    sendSecondStepCode(challenge.challenge).catch(setError);
  }, [method, challenge.challenge, sendSecondStepCode]);

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await auth.verifySecondStep(challenge.challenge, method, code);
    } catch (caught) {
      setError(caught);
      // The sign-in has run out of time or of attempts: nothing more can be done with it.
      if (caught instanceof ApiError && (caught.code === "SESSION_EXPIRED" || caught.code === "TOO_MANY_ATTEMPTS")) setCode("");
    } finally {
      setBusy(false);
    }
  };

  const step = SECOND_STEPS[method];

  return (
    <Screen edges={["top", "bottom"]} centered>
      <View style={{ gap: spacing.xs }}>
        <Title>One more step</Title>
        <Body muted>{step.prompt}</Body>
      </View>

      {error ? <Notice>{messageOf(error)}</Notice> : null}

      <Field label={step.label} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} keyboardType={method === "backup" ? "default" : "number-pad"} autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus returnKeyType="go" onSubmitEditing={verify} />
      <Button label="Verify" busy={busy} disabled={code.trim() === ""} onPress={verify} />

      {challenge.methods.filter((other) => other !== method).map((other) => (
        <Button key={other} variant="link" label={SECOND_STEPS[other].choose} onPress={() => choose(other)} />
      ))}
      <Button variant="link" label="Back to sign in" onPress={onCancel} />
    </Screen>
  );
}
