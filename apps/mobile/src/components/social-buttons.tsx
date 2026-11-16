import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import { PROVIDERS } from "@/lib/social";
import { spacing, text, useColors } from "@/lib/theme";

/**
 * "Continue with Google" and the other providers the API has switched on, under a line that
 * says "or". Nothing at all when there are none, so an app without them looks as it always did.
 */
export function SocialButtons({ providers, busy, disabled, onPick }: { providers: string[]; busy: string | null; disabled?: boolean; onPick: (provider: string) => void }) {
  const colors = useColors();
  const known = providers.filter((provider) => PROVIDERS[provider]);
  if (known.length === 0) return null;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.or}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={{ color: colors.muted, fontSize: text.small }}>or</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      {known.map((provider) => (
        <Button key={provider} variant="secondary" icon={PROVIDERS[provider].icon} label={`Continue with ${PROVIDERS[provider].label}`} busy={busy === provider} disabled={disabled || (busy !== null && busy !== provider)} onPress={() => onPick(provider)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  or: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
