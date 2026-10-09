"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LogOutIcon, MoreHorizontalIcon, PencilIcon, PowerIcon, PowerOffIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteUserAction, signOutUserAction, updateUserAction } from "@/app/dashboard/access/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { ManagedUser } from "@/lib/access";

/**
 * What can be done to one user from the list. Laravel has the last word on each: it
 * refuses, with its reason, to switch off the last administrator and the like.
 */
export function UserRowActions({
  user,
  canEdit,
  canDelete,
  keepsDeleted = false,
}: {
  user: ManagedUser;
  canEdit: boolean;
  canDelete: boolean;
  /** Whether a deleted account is kept under Deleted accounts, to be restored. */
  keepsDeleted?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const who = user.name || user.email;

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        toast.success(done);
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${who}`} disabled={pending}>
            {pending ? <Spinner /> : <MoreHorizontalIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <>
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/access/users/${encodeURIComponent(user.id)}`}>
                  <PencilIcon />
                  Edit
                </Link>
              </DropdownMenuItem>
              {!user.isSelf &&
                (user.active ? (
                  <DropdownMenuItem onSelect={() => run(() => updateUserAction(user.id, { active: false }), `${who} is switched off and signed out.`)}>
                    <PowerOffIcon />
                    Switch off
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => run(() => updateUserAction(user.id, { active: true }), `${who} can sign in again.`)}>
                    <PowerIcon />
                    Switch on
                  </DropdownMenuItem>
                ))}
              {user.devices > 0 && (
                <DropdownMenuItem onSelect={() => run(() => signOutUserAction(user.id), user.isSelf ? "Your other devices are signed out." : `${who} is signed out everywhere.`)}>
                  <LogOutIcon />
                  {user.isSelf ? "Sign out my other devices" : "Sign out everywhere"}
                </DropdownMenuItem>
              )}
            </>
          )}
          {canDelete && !user.isSelf && (
            <>
              {canEdit && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {who}?</AlertDialogTitle>
            <AlertDialogDescription>
              {keepsDeleted
                ? "They are signed out everywhere and can't sign in, and their email can't sign up again. The account is kept under Deleted accounts, where it can be restored as it was or removed for good."
                : "Their account, their roles and their sign-in methods are removed, and they are signed out everywhere. This can't be undone. To keep the account and stop them signing in, switch it off instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => deleteUserAction(user.id), keepsDeleted ? `${who} is deleted. Restore them from Deleted accounts.` : `${who} is deleted.`)}>
              {pending && <Spinner />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
