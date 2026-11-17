import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { SecondStep } from "@/components/second-step";
import { SocialButtons } from "@/components/social-buttons";
import { Body, Button, Field, Notice, Screen, Title } from "@/components/ui";
import { ApiError, messageOf } from "@/lib/api";
import { signInMethods, useAuth, type Challenge } from "@/lib/auth";
import { takeComeBack } from "@/lib/guest";
import { site } from "@/lib/site";
import { spacing } from "@/lib/theme";

/**
 * Sign in: a password, or a code sent by email when the API has that switched on, and
 * then the second step for an account that has one.
 *
 * Where the API has Google (or GitHub) switched on, there is a button for it. Where it lets
 * people create their own account, there is a way to from here.
 *
 * Signing in with a passkey or an emailed link is the dashboard's for now: each ends at a
 * web address, which a phone app has to be taught to open.
 */
export default function SignIn() {
  const auth = useAuth();
  // Sent here from sign-up with an address that already has an account: it is filled in.
  const params = useLocalSearchParams<{ email?: string; reason?: string }>();
  const [way, setWay] = useState<"password" | "code">("password");
  const [emailCode, setEmailCode] = useState(false);
  const [registration, setRegistration] = useState(false);
  const [social, setSocial] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    signInMethods().then((methods) => {
      setEmailCode(methods.emailCode);
      setRegistration(methods.registration);
      setSocial(methods.social);
    });
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

  const withProvider = async (name: string) => {
    setProvider(name);
    setError(null);
    try {
      setChallenge(await auth.signInWithProvider(name));
    } catch (caught) {
      setError(caught);
    } finally {
      setProvider(null);
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
        <Body muted>{way === "password" ? (params.reason === "cart" ? "Sign in to add it to your cart. You'll come back to it." : "Sign in to continue.") : codeSent ? `Enter the code we sent to ${address}.` : "We'll email you a code to sign in with."}</Body>
      </View>

      {error && !(error instanceof ApiError && error.issues.length > 0) ? <Notice>{messageOf(error)}</Notice> : null}

      <Field label="Email" value={email} onChangeText={setEmail} error={issue("email")} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" textContentType="username" editable={!codeSent} returnKeyType="next" />

      {way === "password" ? (
        <>
          <Field label="Password" value={password} onChangeText={setPassword} error={issue("password")} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => run(async () => setChallenge(await auth.signIn(address, password)))} />
          <Button label="Sign in" busy={busy} disabled={address === "" || password === "" || provider !== null} onPress={() => run(async () => setChallenge(await auth.signIn(address, password)))} />
        </>
      ) : codeSent ? (
        <>
          <Field label="Code" value={code} onChangeText={setCode} error={issue("code")} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" autoFocus />
          <Button label="Sign in" busy={busy} disabled={code.trim() === "" || provider !== null} onPress={() => run(async () => setChallenge(await auth.signInWithCode(address, code)))} />
          <Button variant="link" label="Use a different email" onPress={() => { setCodeSent(false); setCode(""); setError(null); }} />
        </>
      ) : (
        <Button label="Email me a code" busy={busy} disabled={address === "" || provider !== null} onPress={() => run(async () => { await auth.sendEmailCode(address); setCodeSent(true); })} />
      )}

      <SocialButtons providers={social} busy={provider} disabled={busy} onPick={withProvider} />

      {emailCode ? (
        <Button variant="link" label={way === "password" ? "Sign in with an emailed code instead" : "Sign in with a password instead"} onPress={() => { setWay(way === "password" ? "code" : "password"); setCodeSent(false); setCode(""); setError(null); }} />
      ) : null}

      {registration ? <Button variant="link" label="New here? Create an account" disabled={busy} onPress={() => router.push("/sign-up")} /> : null}
      {/* Come from the shop, before signing in: back to it. */}
      {router.canGoBack() ? <Button variant="link" label="Keep browsing" disabled={busy} onPress={() => { takeComeBack(); router.back(); }} /> : null}
    </Screen>
  );
}
