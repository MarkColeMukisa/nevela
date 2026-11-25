import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Body, Button, Field, Heading, Notice } from "@/components/ui";
import { api, ApiError, messageOf, type ConfirmAsked } from "@/lib/api";
import { spacing, useColors } from "@/lib/theme";

type Way = "password" | "email" | "totp";
type Answer = { confirmation?: string } | null;

/**
 * Asking someone to confirm it's them, when the API wants it before something that matters
 * (a 428: a refund, a change to who can sign in). Their password, a code emailed to them, or
 * their authenticator app; then lib/api.ts sends what they were doing again. Passkeys are the
 * dashboard's: a phone app needs a build tied to the app's own domain to use one.
 *
 * Mounted once, around the app.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [asked, setAsked] = useState<ConfirmAsked | null>(null);
  const settle = useRef<((answer: Answer) => void) | null>(null);

  useEffect(() => {
    api.onConfirm(
      (question) =>
        new Promise<Answer>((resolve) => {
          // A second question while one is open: the first is let go.
          settle.current?.(null);
          settle.current = resolve;
          setAsked(question);
        }),
    );
    return () => api.onConfirm(null);
  }, []);

  const finish = (answer: Answer) => {
    settle.current?.(answer);
    settle.current = null;
    setAsked(null);
  };

  return (
    <>
      {children}
      {asked ? <Ask asked={asked} onDone={finish} /> : null}
    </>
  );
}

function Ask({ asked, onDone }: { asked: ConfirmAsked; onDone: (answer: Answer) => void }) {
  const colors = useColors();
  const [way, setWay] = useState<Way>("password");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const answer = await api.post<{ confirmation?: string }>("/auth/confirm", { challenge: asked.challenge, method: way, ...(way === "password" ? { password: value } : { code: value.trim() }) });
      onDone(answer);
    } catch (caught) {
      // Too long, or too many tries: this question is over. What they were doing can be tried again.
      if (caught instanceof ApiError && (caught.status === 410 || caught.status === 429)) {
        onDone(null);
        return;
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const emailMe = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/confirm/send", { challenge: asked.challenge });
      setWay("email");
      setValue("");
      setSent(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const label = way === "password" ? "Your password" : way === "email" ? "The code we emailed you" : "The code in your authenticator app";

  return (
    <Modal animationType="slide" transparent onRequestClose={() => onDone(null)}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
        <SafeAreaView edges={["bottom"]} style={{ backgroundColor: colors.background, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Heading>Confirm it&apos;s you</Heading>
            <Body muted>{asked.window ? "Changing who can sign in needs your password again. You won't be asked again for a few minutes." : "This needs your password again, for this one time."}</Body>
            {error ? <Notice>{messageOf(error)}</Notice> : null}
            {sent && way === "email" ? <Notice tone="success">A code is on its way to your email.</Notice> : null}
            <Field
              label={label}
              value={value}
              onChangeText={setValue}
              autoFocus
              {...(way === "password"
                ? { secureTextEntry: true, autoComplete: "current-password" as const, textContentType: "password" as const }
                : { keyboardType: "number-pad" as const, autoComplete: "one-time-code" as const, textContentType: "oneTimeCode" as const, maxLength: 6 })}
            />
            <Button label="Confirm" busy={busy} disabled={value.trim() === ""} onPress={confirm} />
            {way !== "email" && asked.methods.includes("email") ? <Button variant="link" label="Email me a code instead" disabled={busy} onPress={emailMe} /> : null}
            {way !== "totp" && asked.methods.includes("totp") ? <Button variant="link" label="Use my authenticator app" disabled={busy} onPress={() => { setWay("totp"); setValue(""); setError(null); }} /> : null}
            {way !== "password" && asked.methods.includes("password") ? <Button variant="link" label="Use my password" disabled={busy} onPress={() => { setWay("password"); setValue(""); setError(null); }} /> : null}
            <Button variant="secondary" label="Cancel" disabled={busy} onPress={() => onDone(null)} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
