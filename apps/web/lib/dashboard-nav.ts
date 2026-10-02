// Extra dashboard sidebar links (kept in Flare's shape).
// Add your own links outside the generated block.
// generated:start
export interface DashboardLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/dashboard/resource-icon.tsx). */
  icon: string;
}

export const generatedDashboardLinks: DashboardLink[] = [];
// generated:end

/** Links shown under "Platform" in the dashboard sidebar. */
export const dashboardLinks: DashboardLink[] = [
  ...generatedDashboardLinks,
];
