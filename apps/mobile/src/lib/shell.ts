import type { User } from "./auth";

/**
 * Which app a person is given: the one for the people who run the business, or the one
 * for its customers. The same codebase, the same API and the same sign-in for both.
 */
export type Shell = "customer" | "staff";

/**
 * Decided by roles, with nothing to configure in the app.
 *
 * The API says which role someone who signs up starts with (its `default_role`, USER
 * unless the app sets NEVELA_DEFAULT_ROLE). An account that holds only that role is a
 * customer. Anyone who holds another as well, such as an editor or a role of your own for
 * staff, and every administrator, is staff.
 *
 * When the API doesn't say (an older one, or none was reachable), everyone is staff: what
 * the app did before it had customers.
 */
export function shellFor(user: Pick<User, "isAdmin" | "roles"> | null, defaultRole: string | null | undefined): Shell {
  if (!user || !defaultRole || user.isAdmin) return "staff";
  const customer = defaultRole.toLowerCase();
  return user.roles.every((role) => role.toLowerCase() === customer) ? "customer" : "staff";
}
