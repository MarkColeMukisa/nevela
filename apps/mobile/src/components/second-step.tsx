import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { messageOf, ApiError } from "@/lib/api";
import { useAuth, type Challenge, type SecondStepMethod } from "@/lib/auth";
import { spacing } from "@/lib/theme";

const SECOND_STEPS: Record<SecondStepMethod, { label: string; prompt: string; choose: string }> = {
  totp: { label: "Code", prompt: "Enter the code from your authenticator app.", choose: "Use my authenticator app" },
  email: { label: "Code", prompt: "Enter the code we emailed you.", choose: "Email me a code" },
  backup: { label: "Backup code", prompt: "Enter one of your backup codes. Each works once.", choose: "Use a backup code" },
};

/** The second step of a sign-in: a code from an app, from an email, or a backup code. */
export function SecondStep({ challenge, onCancel }: { challenge: Challenge; onCancel: () => void }) {
  const auth = useAuth();
  const [method, setMethod] = useState<SecondStepMethod>(challenge.methods[0] ?? "totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const choose = (next: SecondStepMethod) => {
    setError(null);
    setCode("");
    setMethod(next);
  };

  const { sendSecondStepCode } = auth;
  const sendCode = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await sendSecondStepCode(challenge.challenge);
    } catch (caught) {
      setError(caught);
    } finally {
      setSending(false);
    }
  }, [challenge.challenge, sendSecondStepCode]);

  // An emailed code has to be asked for: on choosing it, and at the start for an
  // account whose only second step it is.
  useEffect(() => {
    if (method === "email") sendCode();
  }, [method, sendCode]);

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

      {method === "email" ? <Button variant="link" label="Send the code again" busy={sending} disabled={busy} onPress={sendCode} /> : null}
      {challenge.methods.filter((other) => other !== method).map((other) => (
        <Button key={other} variant="link" label={SECOND_STEPS[other].choose} disabled={busy} onPress={() => choose(other)} />
      ))}
      {/* Not while a code is being checked: the answer would sign in someone who had just backed out. */}
      <Button variant="link" label="Back to sign in" disabled={busy} onPress={onCancel} />
    </Screen>
  );
}
