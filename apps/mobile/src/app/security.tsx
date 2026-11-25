import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { QrCode } from "@/components/qr-code";
import { Body, Button, Card, Field, Heading, Loading, Notice, Row, Screen } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { radius, spacing, text, useColors } from "@/lib/theme";
import { PROVIDERS } from "@/lib/social";
import { useLoaded } from "@/lib/use-loaded";
import { ago } from "@/lib/when";

/** Which of these the API has switched on (`GET auth/config`). */
interface Config {
  passkeys?: boolean;
  twoFactor?: { authenticator?: boolean; email?: boolean };
}

interface Passkey {
  id: string;
  name: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
}

/** What `POST auth/two-factor/enable` answers for an authenticator app: not on yet, until a code proves the app has the secret. */
interface Setup {
  totpURI: string;
  secret: string;
  backupCodes: string[];
}

const loadConfig = () => api.get<Config>("/auth/config");

/** Two-step sign-in, passkeys and connected accounts: what protects the account beyond its password. */
export default function Security() {
  const config = useLoaded(loadConfig);
  if (config.loading) return <Loading />;

  const twoFactor = config.data?.twoFactor ?? {};
  return (
    <Screen edges={["bottom"]}>
      {config.error ? <Notice>{messageOf(config.error)}</Notice> : null}
      {twoFactor.authenticator !== false || twoFactor.email !== false ? <TwoStep authenticator={twoFactor.authenticator !== false} email={twoFactor.email !== false} /> : null}
      {config.data?.passkeys !== false ? <Passkeys /> : null}
      <LinkedAccounts />
    </Screen>
  );
}

function TwoStep({ authenticator, email }: { authenticator: boolean; email: boolean }) {
  const { user, reload } = useAuth();
  const [password, setPassword] = useState("");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  /** Backup codes are shown once, when they are made. */
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const run = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (what: string, value: string) => {
    await Clipboard.setStringAsync(value);
    setCopied(what);
  };

  const start = (method: "totp" | "email") =>
    run(method, async () => {
      const answer = await api.post<{ enabled: boolean; backupCodes: string[] } & Partial<Setup>>("/auth/two-factor/enable", { password, method });
      if (answer.enabled) {
        // Codes by email need nothing more: it is on.
        setCodes(answer.backupCodes);
        setPassword("");
        await reload();
      } else if (answer.totpURI && answer.secret) {
        setSetup({ totpURI: answer.totpURI, secret: answer.secret, backupCodes: answer.backupCodes });
      }
    });

  const confirm = () =>
    run("confirm", async () => {
      await api.post("/auth/two-factor/confirm", { code: code.trim() });
      setCodes(setup?.backupCodes ?? null);
      setSetup(null);
      setCode("");
      setPassword("");
      await reload();
    });

  const turnOff = () =>
    run("off", async () => {
      await api.post("/auth/two-factor/disable", { password });
      setPassword("");
      setCodes(null);
      await reload();
    });

  const newCodes = () =>
    run("codes", async () => {
      const answer = await api.post<{ backupCodes: string[] }>("/auth/two-factor/backup-codes", { password });
      setCodes(answer.backupCodes);
      setPassword("");
    });

  const wrongPassword = error instanceof ApiError && error.code === "INVALID_PASSWORD" ? error.message : error instanceof ApiError ? error.issue("password") : undefined;
  const wrongCode = error instanceof ApiError && error.code === "INVALID_TWO_FACTOR_CODE" ? error.message : undefined;
  const other = error && !wrongPassword && !wrongCode ? messageOf(error) : null;

  return (
    <View style={{ gap: spacing.md }}>
      <Heading>Two-step sign-in</Heading>
      {other ? <Notice>{other}</Notice> : null}

      {codes ? (
        <BackupCodes codes={codes} copied={copied === "codes"} onCopy={() => copy("codes", codes.join("\n"))} onDone={() => setCodes(null)} />
      ) : setup ? (
        <>
          <Body muted>Add this account to an authenticator app, then enter the code it shows.</Body>
          <Button variant="secondary" icon="open-outline" label="Open in my authenticator app" onPress={() => Linking.openURL(setup.totpURI).catch(() => setError(new Error("No authenticator app on this phone opened the link. Copy the key into one instead.")))} />
          <View style={{ alignItems: "center", gap: spacing.sm }}>
            <QrCode value={setup.totpURI} />
            <Body muted small>Or scan this with an authenticator app on another device.</Body>
          </View>
          <Secret label="Setup key" value={setup.secret} copied={copied === "secret"} onCopy={() => copy("secret", setup.secret)} />
          <Field label="Code from the app" value={code} onChangeText={setCode} error={wrongCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" returnKeyType="go" onSubmitEditing={confirm} />
          <Button label="Turn on two-step sign-in" busy={busy === "confirm"} disabled={code.trim() === ""} onPress={confirm} />
          <Button variant="link" label="Cancel" disabled={busy !== null} onPress={() => { setSetup(null); setCode(""); setError(null); }} />
        </>
      ) : user?.twoFactorEnabled ? (
        <>
          <Body muted>On. Signing in takes your password and then a code.</Body>
          <Field label="Your password" value={password} onChangeText={setPassword} error={wrongPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
          <Button variant="secondary" label="Make new backup codes" busy={busy === "codes"} disabled={password === "" || busy !== null} onPress={newCodes} />
          <Button variant="danger" label="Turn off two-step sign-in" busy={busy === "off"} disabled={password === "" || busy !== null} onPress={turnOff} />
        </>
      ) : (
        <>
          <Body muted>Off. With it on, signing in takes your password and then a code, so a stolen password alone doesn't open your account.</Body>
          <Field label="Your password" value={password} onChangeText={setPassword} error={wrongPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
          {authenticator ? <Button label="Use an authenticator app" busy={busy === "totp"} disabled={password === "" || busy !== null} onPress={() => start("totp")} /> : null}
          {email ? <Button variant={authenticator ? "secondary" : "primary"} label="Use a code sent by email" busy={busy === "email"} disabled={password === "" || busy !== null} onPress={() => start("email")} /> : null}
        </>
      )}
    </View>
  );
}

/** Something to copy exactly: a setup key. */
function Secret({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
      <View style={[styles.secret, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text selectable style={{ flex: 1, color: colors.text, fontSize: text.body, letterSpacing: 1 }}>{value}</Text>
        <Button variant="link" label={copied ? "Copied" : "Copy"} onPress={onCopy} />
      </View>
    </View>
  );
}

function BackupCodes({ codes, copied, onCopy, onDone }: { codes: string[]; copied: boolean; onCopy: () => void; onDone: () => void }) {
  const colors = useColors();
  return (
    <>
      <Notice tone="success">Two-step sign-in is on. Save these backup codes somewhere safe: each signs you in once when you can't get a code, and they are not shown again.</Notice>
      <View style={[styles.codes, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {codes.map((one) => (
          <Text key={one} selectable style={[styles.code, { color: colors.text }]}>{one}</Text>
        ))}
      </View>
      <Button variant="secondary" icon="copy-outline" label={copied ? "Copied" : "Copy the codes"} onPress={onCopy} />
      <Button label="I've saved them" onPress={onDone} />
    </>
  );
}

const loadPasskeys = () => api.get<{ data: Passkey[] }>("/auth/passkeys");

function Passkeys() {
  const passkeys = useLoaded(loadPasskeys);
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { reload } = passkeys;

  const remove = useCallback(
    async (id: string) => {
      setRemoving(id);
      setError(null);
      try {
        await api.delete(`/auth/passkeys/${encodeURIComponent(id)}`);
        setAsking(null);
        await reload();
      } catch (caught) {
        setError(caught);
      } finally {
        setRemoving(null);
      }
    },
    [reload],
  );

  const all = passkeys.data?.data ?? [];
  const shown = error ?? passkeys.error;

  return (
    <View style={{ gap: spacing.md }}>
      <Heading>Passkeys</Heading>
      {shown ? <Notice>{messageOf(shown)}</Notice> : null}
      {all.length === 0 && !shown ? <Body muted>None yet. A passkey signs you in to the dashboard with your fingerprint, face or screen lock, with no password to type.</Body> : null}
      {all.map((passkey) => (
        <Card key={passkey.id}>
          <Row icon="finger-print-outline" label={passkey.name || "Passkey"} detail={passkey.lastUsedAt ? `Last used ${ago(passkey.lastUsedAt)}` : `Added ${ago(passkey.createdAt)}, not used yet`} last={asking !== passkey.id} onPress={asking === passkey.id ? undefined : () => setAsking(passkey.id)} />
          {asking === passkey.id ? (
            <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}>
              <Button variant="danger" label="Remove this passkey" busy={removing === passkey.id} onPress={() => remove(passkey.id)} />
              <Button variant="secondary" label="Keep it" disabled={removing !== null} onPress={() => setAsking(null)} />
            </View>
          ) : null}
        </Card>
      ))}
      <Body muted small>Passkeys are added in the dashboard, under your account. Adding one from this app, and signing in to the app with one, need a build of the app tied to your own domain, so they are not part of the app you run in Expo Go.</Body>
    </View>
  );
}

interface LinkedAccount {
  id: string;
  provider: string;
  email: string | null;
  connectedAt: string | null;
}

const loadLinked = () => api.get<{ data: LinkedAccount[] }>("/auth/social");

/**
 * The Google and GitHub accounts that sign in to this one. Shown once there is one: signing
 * in with a provider whose verified address is this account's connects it.
 */
function LinkedAccounts() {
  const linked = useLoaded(loadLinked);
  const [asking, setAsking] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { reload } = linked;

  const disconnect = useCallback(
    async (id: string) => {
      setRemoving(id);
      setError(null);
      try {
        await api.delete(`/auth/social/${encodeURIComponent(id)}`);
        setAsking(null);
        await reload();
      } catch (caught) {
        setError(caught);
      } finally {
        setRemoving(null);
      }
    },
    [reload],
  );

  const all = linked.data?.data ?? [];
  const shown = error ?? linked.error;
  if (all.length === 0 && !shown) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <Heading>Connected accounts</Heading>
      {shown ? <Notice>{messageOf(shown)}</Notice> : null}
      {all.map((account) => {
        const provider = PROVIDERS[account.provider];
        const label = provider?.label ?? account.provider;
        return (
          <Card key={account.id}>
            <Row
              icon={provider?.icon ?? "link-outline"}
              label={label}
              detail={[account.email, account.connectedAt ? `Connected ${ago(account.connectedAt)}` : null].filter(Boolean).join(" · ")}
              last={asking !== account.id}
              onPress={asking === account.id ? undefined : () => setAsking(account.id)}
            />
            {asking === account.id ? (
              <View style={{ padding: spacing.lg, paddingTop: 0, gap: spacing.sm }}>
                <Body muted small>{label} won't sign you in any more. Your password, and an emailed code where the app has them, still do.</Body>
                <Button variant="danger" label={`Disconnect ${label}`} busy={removing === account.id} onPress={() => disconnect(account.id)} />
                <Button variant="secondary" label="Keep it" disabled={removing !== null} onPress={() => setAsking(null)} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  secret: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingLeft: spacing.md, paddingRight: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  codes: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  code: { width: "47%", fontSize: text.body, letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
});
