"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { allowEmailAction, removeAccountAction, restoreAccountAction } from "@/app/dashboard/access/actions";
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
import { Spinner } from "@/components/ui/spinner";

/** Restore a closed account, or remove it for good. Laravel has the last word on both. */
export function DeletedAccountActions({ id, who, email }: { id: string; who: string; email: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restoreAccountAction(id);
      if (result.ok) {
        toast.success(`${who} can sign in again, with everything the account had.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeAccountAction(id);
      setConfirming(false);
      if (result.ok) {
        toast.success(`${who} is removed for good. Their email stays blocked.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="outline" size="sm" disabled={pending} onClick={restore}>
        {pending && !confirming ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
        Restore
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => setConfirming(true)}>
        Remove for good
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {who} for good?</AlertDialogTitle>
            <AlertDialogDescription>
              The account, its roles and its sign-in methods are erased, and it can&apos;t be restored afterwards. {email} stays blocked from signing up again
              until you allow it, below.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Remove for good
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Let an email whose account was removed for good sign up again. */
export function AllowEmailButton({ id, hint }: { id: string; hint: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function allow() {
    startTransition(async () => {
      const result = await allowEmailAction(id);
      if (result.ok) {
        toast.success(`${hint} can sign up again.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={allow}>
      {pending && <Spinner data-icon="inline-start" />}
      Allow again
    </Button>
  );
}
