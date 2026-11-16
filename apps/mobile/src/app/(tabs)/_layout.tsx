import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_HEIGHT } from "@/components/ui";
import { useColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** A floating bar, clear of the phone's own gesture area, with a lifted shadow. */
export default function TabsLayout() {
  const colors = useColors();
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const icon = (name: IconName, active: IconName) => ({ focused, size }: { focused: boolean; size: number }) => <Ionicons name={focused ? active : name} color={focused ? colors.accent : colors.muted} size={size} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarItemStyle: { paddingTop: 4 },
        tabBarStyle: {
          position: "absolute",
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 10) + 6,
          height: TAB_BAR_HEIGHT,
          paddingBottom: 10,
          borderRadius: 24,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.tabBar,
          elevation: 12,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: dark ? 0.35 : 0.12,
          shadowRadius: 16,
        },
      }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("grid-outline", "grid") }} />
      <Tabs.Screen name="records" options={{ title: "Records", tabBarIcon: icon("albums-outline", "albums") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline", "person") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("settings-outline", "settings") }} />
    </Tabs>
  );
}
