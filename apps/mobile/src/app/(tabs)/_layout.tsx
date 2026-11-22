import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_HEIGHT } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useCanTrack, useCart, useCatalogue, useShop } from "@/lib/cart";
import { iconFor } from "@/lib/icons";
import { useStaffTabs } from "@/lib/layout";
import { useColors } from "@/lib/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/**
 * A floating bar, clear of the phone's own gesture area, with a lifted shadow.
 *
 * Staff see Home, the tabs packages/shared/layout.ts names (a shop's orders and what it sells),
 * then More, which holds everything else: the same order as the dashboard's sidebar. In an app
 * with no shop, Records is the tab between. Customers have the shop's own tabs.
 */
export default function TabsLayout() {
  const colors = useColors();
  const dark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  // Customers have no Records tab: that is how staff work with the data. What they may see is on their home.
  const { shell, user } = useAuth();
  // Where there is a shop to buy from, a customer's tabs are the shop's.
  const shop = useShop();
  const buying = shell === "customer" && shop !== null;
  // Someone browsing before signing in has the shop and the way to an account: nothing else.
  const catalogue = useCatalogue();
  const guest = user === null && catalogue !== null;
  const tracking = useCanTrack(shop);
  const cart = useCart();
  const staff = user !== null && shell !== "customer";
  const tabs = useStaffTabs();
  const slot = (index: number) => {
    const tab = staff ? tabs[index] : undefined;
    if (!tab) return { href: null };
    const [name, active]: [IconName, IconName] =
      tab.role === "orders" ? ["receipt-outline", "receipt"] : tab.role === "catalogue" ? ["pricetags-outline", "pricetags"] : [iconFor(tab.resource.icon), iconFor(tab.resource.icon)];
    return { title: tab.title, tabBarIcon: icon(name, active) };
  };
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
      <Tabs.Screen name="index" options={{ title: buying || guest ? "Shop" : "Home", tabBarIcon: icon(buying || guest ? "storefront-outline" : "grid-outline", buying || guest ? "storefront" : "grid") }} />
      <Tabs.Screen name="staff-1" options={slot(0)} />
      <Tabs.Screen name="staff-2" options={slot(1)} />
      <Tabs.Screen name="staff-3" options={slot(2)} />
      {/* Staff with tabs of their own reach every record under More. */}
      <Tabs.Screen name="records" options={{ title: "Records", href: shell === "customer" || guest || (staff && tabs.length > 0) ? null : undefined, tabBarIcon: icon("albums-outline", "albums") }} />
      <Tabs.Screen name="cart" options={{ title: "Cart", href: buying ? undefined : null, tabBarBadge: cart.count > 0 ? cart.count : undefined, tabBarIcon: icon("cart-outline", "cart") }} />
      <Tabs.Screen name="orders" options={{ title: "Orders", href: buying && tracking ? undefined : null, tabBarIcon: icon("receipt-outline", "receipt") }} />
      <Tabs.Screen name="account" options={{ title: "Account", href: staff ? null : undefined, tabBarIcon: icon("person-outline", "person") }} />
      <Tabs.Screen name="settings" options={{ title: staff ? "More" : "Settings", href: guest ? null : undefined, tabBarIcon: staff ? icon("ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle") : icon("settings-outline", "settings") }} />
    </Tabs>
  );
}
