"use server";

import { revalidatePath } from "next/cache";
import { laravel } from "@/lib/laravel";
import { getSession } from "@/lib/session";

/** Mark the customer's notifications read: one, or all of them. Laravel only ever changes their own. */
export async function markReadAction(id?: string): Promise<void> {
  if (!(await getSession())) return;
  await laravel("_nevela/notifications/read", { method: "POST", body: id === undefined ? {} : { id } });
  revalidatePath("/account/notifications");
}
