import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { AuthProvider, useAuth } from "@/lib/auth";
import { useColors } from "@/lib/theme";

// The splash screen stays up until the stored sign-in has been checked, so the app opens
// on the right screen rather than flashing the sign-in form at someone who is signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <Screens />
    </AuthProvider>
  );
}

function Screens() {
  const { user, loading } = useAuth();
  const colors = useColors();
  const dark = useColorScheme() === "dark";

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  const base = dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: colors.background, card: colors.background, text: colors.text, border: colors.border, primary: colors.brand } };

  return (
    <ThemeProvider value={theme}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerBackButtonDisplayMode: "minimal", headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
        {/* Signed in: the app. Signed out: only the sign-in screen exists, so no link can reach past it. */}
        <Stack.Protected guard={user !== null}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="devices" options={{ title: "Devices" }} />
          <Stack.Screen name="change-password" options={{ title: "Change password" }} />
        </Stack.Protected>
        <Stack.Protected guard={user === null}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
