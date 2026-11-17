/**
 * Who may do what, as the Users and Roles screens handle it. What the API sends for
 * `_nevela/users`, `_nevela/roles` and `_nevela/permissions`, and the small sums the screens
 * need on them. Kept free of anything that needs the app running, so it can be tested on its own.
 *
 * Laravel decides every request. Nothing here is a rule: it is what to show, and what to send.
 */

/** One role, as `GET _nevela/roles` sends it. */
export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  /** As written, patterns included ("products.*"). */
  grants: string[];
  /** What the grants come to today, one permission each. */
  permissions: string[];
  isSystem: boolean;
  /** Holds everything: not shaped here. */
  isAdmin: boolean;
  users: number;
  /** Whether the person asking may change it or hand it out. */
  withinYours: boolean;
}

/** One person, as `GET _nevela/users` sends them. */
export interface AccessUser {
  id: string;
  name: string | null;
  email: string | null;
  active: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  image: string | null;
  roles: { id: string; name: string }[];
  isAdmin: boolean;
  isSelf: boolean;
  withinYours: boolean;
  devices: number;
  lastActiveAt: string | null;
  createdAt: string | null;
}

/** A permission to give, as the catalogue lists it: a feature, and what can be done to it. */
export interface Feature {
  key: string;
  name: string;
  actions: string[];
  /** The name an action's button has, for the resource's own actions. */
  labels?: Record<string, string>;
}

export interface Catalog {
  modules: { key: string; name: string; groups: { key: string; name: string; features: Feature[] }[] }[];
  total: number;
}

/** The four every resource has, in the order a person reads them. */
export const ABILITIES = ["view", "create", "edit", "delete"] as const;

export const keyOf = (feature: string, action: string): string => `${feature}.${action}`;

/** What an action is called: its own button's label, or the ability in words. */
export function actionName(feature: Feature, action: string): string {
  return feature.labels?.[action] ?? action.charAt(0).toUpperCase() + action.slice(1).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
}

/** A feature's actions with the four usual ones first, in reading order. */
export function actionsOf(feature: Feature): string[] {
  const usual = ABILITIES.filter((ability) => feature.actions.includes(ability));
  return [...usual, ...feature.actions.filter((action) => !(ABILITIES as readonly string[]).includes(action))];
}

/** Whether a person holds a permission, as the app was told at sign-in. Administrators hold all. */
export function can(user: { isAdmin: boolean; permissions: string[] } | null, key: string): boolean {
  return Boolean(user && (user.isAdmin || user.permissions.includes(key)));
}

/** The permissions with one switched on or off. */
export function toggled(permissions: string[], key: string, on: boolean): string[] {
  const rest = permissions.filter((one) => one !== key);
  return on ? [...rest, key] : rest;
}

/** Every action of a feature switched on or off together, for those the person may give. */
export function featureToggled(permissions: string[], feature: Feature, on: boolean, may: (key: string) => boolean = () => true): string[] {
  let next = permissions;
  for (const action of feature.actions) {
    const key = keyOf(feature.key, action);
    if (may(key) || !on) next = toggled(next, key, on);
  }
  return next;
}

/** How many of a feature's actions are on. */
export function heldOf(permissions: string[], feature: Feature): number {
  return feature.actions.filter((action) => permissions.includes(keyOf(feature.key, action))).length;
}

/** Whether a role is written with patterns ("*", "products.*"), which saving the matrix writes out one by one. */
export function usesPatterns(role: Pick<RoleRow, "grants">): boolean {
  return role.grants.some((grant) => grant.includes("*"));
}

/** What to send as a role's grants: each permission that is on, once, in a steady order. */
export function grantsFrom(permissions: string[]): string[] {
  return [...new Set(permissions)].sort();
}

/** Whether the matrix differs from what the role has. */
export function changedGrants(role: Pick<RoleRow, "permissions">, now: string[]): boolean {
  const before = grantsFrom(role.permissions);
  const after = grantsFrom(now);
  return before.length !== after.length || before.some((key, index) => key !== after[index]);
}

/** A person's roles as they are named on a row. */
export function rolesLine(user: Pick<AccessUser, "roles">): string {
  return user.roles.length > 0 ? user.roles.map((role) => role.name).join(", ") : "No role";
}

/** The ids of roles with one added or taken away. */
export function rolesToggled(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((one) => one !== id) : [...ids, id];
}
