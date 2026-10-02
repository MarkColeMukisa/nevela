import type { Policy } from "@flaredev/core";

// Display-only policies, by resource name. Laravel's policies (apps/api/app/Policies)
// are what's enforced; an entry here only hides actions a role can't use, e.g.
//   Product: { read: ["admin", "staff"], create: ["admin"], update: ["admin"], delete: ["admin"] }
export const policies: Record<string, Policy> = {};
