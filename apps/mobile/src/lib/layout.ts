import { useMemo } from "react";

import { layout } from "@shared/layout";
import { staffTabs, type StaffTab } from "@shared/tabs";

import { useResources, type Resource } from "./resources";

/** The most tabs between Home and More: four tabs and More is what fits a phone's bar. */
export const MOST_STAFF_TABS = 3;

/**
 * The tabs staff see between Home and More, from packages/shared/layout.ts: the same as the
 * dashboard's sidebar puts first. A shop's orders and what it sells, unless layout.ts names
 * others. Empty in an app with no shop: Records is the tab then.
 */
export function useStaffTabs(): StaffTab<Resource>[] {
  const { resources } = useResources();
  return useMemo(() => staffTabs(layout, resources).slice(0, MOST_STAFF_TABS), [resources]);
}
