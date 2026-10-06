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
  meta: { page: number; perPage: number; total: number; totalPages: number };
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
