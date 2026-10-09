"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { emptyTrashAction, purgeRecordAction, restoreRecordAction } from "@/app/dashboard/trash/actions";
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

/**
 * The toast after a delete that went to the trash: it says where the record went, and
 * offers to take it back. `undo` restores, and says so in `partly` when only some of
 * several came back; `after` is what to do once it has. `warn` is for a delete that
 * itself only partly worked.
 */
export function toastMovedToTrash(
  message: string,
  undo: () => Promise<{ ok: true; partly?: string } | { ok: false; error: string }>,
  after: () => void,
  warn = false,
) {
  (warn ? toast.warning : toast.success)(message, {
    action: {
      label: "Undo",
      onClick: async () => {
        const result = await undo();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        if (result.partly) toast.warning(result.partly);
        else toast.success("Restored.");
        after();
      },
    },
  });
}

/** How long a deleted record has left: "in 29 days", worked out on the reader's own clock. */
export function TimeLeft({ until }: { until: string | null }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!until) return;
    const hours = (new Date(until).getTime() - Date.now()) / 3_600_000;
    const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    // Past its time and still here: it goes the next time the trash is swept.
    if (hours <= 0) setText("soon");
    else if (hours < 1) setText("in under an hour");
    else setText(hours < 48 ? relative.format(Math.round(hours), "hour") : relative.format(Math.round(hours / 24), "day"));
  }, [until]);

  if (!until) return <span>Kept until removed</span>;
  return (
    <time dateTime={until} title={until} suppressHydrationWarning>
      {text ?? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(until))}
    </time>
  );
}

/** Restore, or delete forever, for one record in the trash. */
export function TrashRowActions({ slug, id, label, noun }: { slug: string; id: string; label: string; noun: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function restore() {
    startTransition(async () => {
      const result = await restoreRecordAction(slug, id);
      if (result.ok) {
        toast.success(`${label} is back in its list.`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function purge() {
    startTransition(async () => {
      const result = await purgeRecordAction(slug, id);
      if (result.ok) {
        toast.success(`${label} is deleted for good.`);
        setConfirming(false);
        router.refresh();
      } else {
        setConfirming(false);
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
        Delete forever
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {label} forever?</AlertDialogTitle>
            <AlertDialogDescription>This {noun} is removed for good, now. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={purge} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Remove everything of one resource from the trash, after being asked twice. */
export function EmptyTrashButton({ slug, count, noun, plural }: { slug: string; count: number; noun: string; plural: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function empty() {
    startTransition(async () => {
      const result = await emptyTrashAction(slug);
      setConfirming(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { removed, kept } = result.data;
      if (kept > 0) toast.warning(`Deleted ${removed} for good. ${kept} couldn't be: other deleted records still belong to them.`);
      else toast.success(`Deleted ${removed.toLocaleString()} ${removed === 1 ? noun : plural} for good.`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
        <Trash2Icon data-icon="inline-start" />
        Empty
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count === 1 ? `the one deleted ${noun}` : `all ${count.toLocaleString()} deleted ${plural}`} forever?
            </AlertDialogTitle>
            <AlertDialogDescription>Everything of this kind in the trash is removed for good, now. None of it can be restored afterwards.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={empty} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
