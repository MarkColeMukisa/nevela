import { Loading } from "@/components/ui";
import { useStaffTabs } from "@/lib/layout";

import { RecordList } from "../app/r/[slug]/index";

/**
 * One of the tabs between Home and More (packages/shared/layout.ts): the list of the resource
 * that tab is, under the tab's own title. The tab bar hides a slot with nothing in it.
 */
export function StaffTabScreen({ index }: { index: number }) {
  const tab = useStaffTabs()[index];
  if (!tab) return <Loading />;
  return <RecordList slug={tab.resource.slug} tab={tab.title} />;
}
