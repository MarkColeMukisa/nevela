import { laravel } from "./laravel";

/**
 * Users, roles and permissions, as Laravel serves them (`/_nevela/users`, `/_nevela/roles`,
 * `/_nevela/permissions`). Laravel decides who may see and change them; these are the
 * shapes, and the calls the Users and Roles screens read with.
 */

export interface ManagedUser {
  id: string;
  name: string | null;
  email: string;
  /** False when the account is switched off: it can't sign in. */
  active: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  /** The small rendition of their picture, ready for an <img>, or null. */
  image: string | null;
  roles: { id: string; name: string }[];
  /** Holds a role that allows everything. */
  isAdmin: boolean;
  /** This is the person looking. */
  isSelf: boolean;
  /** Whether the person looking may change this account: it may do no more than they may. */
  withinYours: boolean;
  /** How many devices they are signed in on. */
  devices: number;
  lastActiveAt: string | null;
  createdAt: string | null;
}

export interface ManagedRole {
  id: string;
  name: string;
  description: string | null;
  /** As written: permissions, and patterns such as "products.*" or "@resources.view". */
  grants: string[];
  /** What the grants come to today. */
  permissions: string[];
  /** Built in: it can be edited, and not renamed or deleted. */
  isSystem: boolean;
  /** Allows everything. */
  isAdmin: boolean;
  /** How many people hold it. */
  users: number;
  /** Whether the person looking may hand it out or change it: it allows nothing they don't hold. */
  withinYours: boolean;
}

export interface PermissionFeature {
  /** The first half of a permission: "products". */
  key: string;
  name: string;
  /** The second halves that mean something for it: create, view, edit, delete. */
  actions: string[];
}

export interface PermissionModule {
  key: string;
  name: string;
  groups: { key: string; name: string; features: PermissionFeature[] }[];
}

export interface PermissionCatalog {
  modules: PermissionModule[];
  /** How many permissions there are in all. */
  total: number;
}

export interface UserList {
  data: ManagedUser[];
  /** keepsDeleted: deleting a user closes the account, to be restored, where it used to remove it. */
  meta: { page: number; perPage: number; total: number; totalPages: number; keepsDeleted?: boolean };
}

/** An account that was closed: by its owner, or by someone deleting it from the Users screen. */
export interface DeletedAccount extends ManagedUser {
  closedAt: string | null;
  /** "self" when its owner closed it, "admin" when someone else did. */
  closedBy: "self" | "admin" | null;
  /** Who, when it wasn't the owner and they still have an account. */
  closedByName: string | null;
}

export interface DeletedAccountList {
  data: DeletedAccount[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
  /** How many emails are blocked with no account left behind them. */
  blocked: number;
}

/** An email whose account was removed for good. The address itself isn't kept. */
export interface BlockedEmail {
  id: string;
  /** Enough to recognise it by: "m•••@gmail.com". */
  hint: string;
  blockedAt: string;
}

/** What a call answered with when it didn't work, in words for the person. */
export function accessError(response: { status: number; body: unknown }): string {
  const body = (response.body ?? {}) as { error?: string; issues?: { message: string }[] };
  if (body.issues?.length) return body.issues.map((issue) => issue.message).join(" ");
  return body.error ?? `Something went wrong (${response.status}).`;
}

export async function listUsers(params: { q?: string; role?: string; status?: string; page?: string }): Promise<UserList | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await laravel(`_nevela/users?${query}`);
  return response.ok ? (response.body as UserList) : null;
}

/**
 * The closed accounts. "migrate" when the app has upgraded and not yet run the migration
 * that keeps them, and null when the person may not see them.
 */
export async function listDeletedAccounts(params: { q?: string; page?: string }): Promise<DeletedAccountList | "migrate" | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const response = await laravel(`_nevela/deleted-accounts?${query}`);
  if (response.ok) return response.body as DeletedAccountList;
  return response.status === 409 || response.status === 404 ? "migrate" : null;
}

export async function listBlockedEmails(): Promise<BlockedEmail[]> {
  const response = await laravel("_nevela/blocked-emails?perPage=100");
  return response.ok ? (response.body as { data: BlockedEmail[] }).data : [];
}

export async function getUser(id: string): Promise<ManagedUser | null> {
  const response = await laravel(`_nevela/users/${encodeURIComponent(id)}`);
  return response.ok ? (response.body as ManagedUser) : null;
}

export async function listRoles(): Promise<ManagedRole[]> {
  const response = await laravel("_nevela/roles");
  return response.ok ? (response.body as { data: ManagedRole[] }).data : [];
}

export async function getRole(id: string): Promise<ManagedRole | null> {
  const response = await laravel(`_nevela/roles/${encodeURIComponent(id)}`);
  return response.ok ? (response.body as ManagedRole) : null;
}

export async function getCatalog(): Promise<PermissionCatalog> {
  const response = await laravel("_nevela/permissions");
  return response.ok ? (response.body as PermissionCatalog) : { modules: [], total: 0 };
}
