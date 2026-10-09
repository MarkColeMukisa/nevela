"use server";

import { revalidatePath } from "next/cache";
import { accessError, type ManagedRole, type ManagedUser } from "@/lib/access";
import { laravel } from "@/lib/laravel";
import { getSession } from "@/lib/session";

/**
 * Changes to users and roles. Each one is a call to Laravel, which checks the person's
 * permissions and the rules on top of them (nobody hands out more than they hold; the
 * last administrator stays), and whose answer is passed back as it is.
 */

export type AccessResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; issues?: { path: string; message: string }[] };

async function send<T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<AccessResult<T>> {
  if (!(await getSession())) return { ok: false, error: "Sign in to continue." };
  const response = await laravel(path, { method, body });
  if (!response.ok) {
    const issues = (response.body as { issues?: { path: string; message: string }[] } | null)?.issues;
    return { ok: false, error: accessError(response), ...(issues ? { issues } : {}) };
  }
  revalidatePath("/dashboard/access", "layout");
  return { ok: true, data: response.body as T };
}

export interface UserInput {
  name?: string;
  email?: string;
  /** Left out, the password stays as it is. */
  password?: string;
  /** Role ids. */
  roles?: string[];
  active?: boolean;
}

export async function createUserAction(input: UserInput): Promise<AccessResult<ManagedUser>> {
  return send("_nevela/users", "POST", input);
}

export async function updateUserAction(id: string, input: UserInput): Promise<AccessResult<ManagedUser>> {
  return send(`_nevela/users/${encodeURIComponent(id)}`, "PATCH", input);
}

export async function deleteUserAction(id: string): Promise<AccessResult<null>> {
  return send(`_nevela/users/${encodeURIComponent(id)}`, "DELETE");
}

/** Open a closed account again, as it was. */
export async function restoreAccountAction(id: string): Promise<AccessResult<ManagedUser>> {
  return send(`_nevela/deleted-accounts/${encodeURIComponent(id)}/restore`, "POST");
}

/** Remove a closed account for good. Its email stays blocked. */
export async function removeAccountAction(id: string): Promise<AccessResult<null>> {
  return send(`_nevela/deleted-accounts/${encodeURIComponent(id)}`, "DELETE");
}

/** Let an email whose account was removed for good sign up again. */
export async function allowEmailAction(id: string): Promise<AccessResult<null>> {
  return send(`_nevela/blocked-emails/${encodeURIComponent(id)}`, "DELETE");
}

/** Sign someone out of every device. */
export async function signOutUserAction(id: string): Promise<AccessResult<{ revoked: number }>> {
  return send(`_nevela/users/${encodeURIComponent(id)}/sessions`, "DELETE");
}

export interface RoleInput {
  name?: string;
  description?: string | null;
  grants?: string[];
}

export async function createRoleAction(input: RoleInput): Promise<AccessResult<ManagedRole>> {
  return send("_nevela/roles", "POST", input);
}

export async function updateRoleAction(id: string, input: RoleInput): Promise<AccessResult<ManagedRole>> {
  return send(`_nevela/roles/${encodeURIComponent(id)}`, "PATCH", input);
}

export async function deleteRoleAction(id: string): Promise<AccessResult<null>> {
  return send(`_nevela/roles/${encodeURIComponent(id)}`, "DELETE");
}
