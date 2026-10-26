"use server";

import { laravel } from "@/lib/laravel";
import { getSession } from "@/lib/session";

/**
 * Marking the bell's notifications read: one, or all of them when no id is given. Laravel
 * only ever changes the signed-in person's own.
 */
export async function markReadAction(id?: string): Promise<{ ok: boolean }> {
  if (!(await getSession())) return { ok: false };
  const response = await laravel("_nevela/notifications/read", { method: "POST", body: id === undefined ? {} : { id } });
  return { ok: response.ok };
}
