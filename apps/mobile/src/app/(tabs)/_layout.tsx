import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";

import { useColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

export default function TabsLayout() {
  const colors = useColors();
  const icon = (name: IconName) => ({ focused, size }: { focused: boolean; size: number }) => <Ionicons name={name} color={focused ? colors.brand : colors.muted} size={size} />;

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.muted, tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border } }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("settings-outline") }} />
    </Tabs>
  );
}
