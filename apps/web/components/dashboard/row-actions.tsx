"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLinkIcon, EyeOffIcon, MoreHorizontalIcon, PencilIcon, SendIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ClientResource } from "@flaredev/core";
import { deleteRecordAction, publishRecordAction } from "@/app/dashboard/actions";
import { restoreRecordAction } from "@/app/dashboard/trash/actions";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { PublishState, ResourceAction } from "@/lib/extras";
import { keptFor, type TrashInfo } from "@/lib/trash-info";
import { actionIcon, useResourceActions } from "./resource-action";
import { ResourceFormSheet, type FormRelations } from "./resource-form-sheet";
import { toastMovedToTrash } from "./trash-actions";

/**
 * Edit and delete for one row. Edit opens a dialog when the row's record came with it
 * (site.dashboard.forms is "sheet"), and otherwise goes to the form page.
 */
export function RowActions({
  resource,
  id,
  record,
  relations = {},
  listHref,
  editHref,
  detailHref,
  canUpdate = true,
  canDelete = true,
  trash,
  actions = [],
  published,
}: {
  resource: ClientResource;
  id: string;
  /** The record itself, when the form opens in a dialog. */
  record?: Record<string, unknown>;
  relations?: FormRelations;
  listHref: string;
  editHref: string;
  /** The record's own page. */
  detailHref: string;
  canUpdate?: boolean;
  canDelete?: boolean;
  /** This resource's trash, when a deleted record goes there instead of going for good. */
  trash?: TrashInfo;
  /** The resource's own actions that this person may run and that apply to this row. */
  actions?: ResourceAction[];
  /** For a resource with a publish date: what this row is now. */
  published?: PublishState;
}) {
  const router = useRouter();
  const [, startPublishing] = useTransition();
  const publish = (now: boolean) => {
    startPublishing(async () => {
      const result = await publishRecordAction(resource.name, id, now);
      if (result.ok) toast.success(now ? `${resource.label} published.` : `${resource.label} is a draft again.`);
      else toast.error(result.error);
      router.refresh();
    });
  };
  const own = useResourceActions(resource.name, { one: resource.label.toLowerCase(), many: resource.pluralLabel.toLowerCase() });
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const { name: resourceName, label, slug } = resource;

  function onDelete() {
    startTransition(async () => {
      const result = await deleteRecordAction(resourceName, id);
      if (result.ok) {
        if (trash) toastMovedToTrash(`${label} moved to the trash.`, () => restoreRecordAction(slug, id), () => router.refresh());
        else toast.success(`${label} deleted.`);
        setConfirming(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Row actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={detailHref}>
                <ExternalLinkIcon />
                Open
              </Link>
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {canUpdate && published && (
            <>
              <DropdownMenuGroup>
                {published === "published" ? (
                  <DropdownMenuItem onSelect={() => publish(false)}>
                    <EyeOffIcon />
                    Unpublish
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => publish(true)}>
                    <SendIcon />
                    {published === "scheduled" ? "Publish now" : "Publish"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}
          {actions.length > 0 && (
            <>
              <DropdownMenuGroup>
                {actions.map((action) => {
                  const Icon = actionIcon(action.icon);
                  return (
                    <DropdownMenuItem key={action.key} disabled={own.pending} onSelect={() => own.start(action, { id })}>
                      <Icon />
                      {action.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              {(canUpdate || canDelete) && <DropdownMenuSeparator />}
            </>
          )}
          {canUpdate && (
            <DropdownMenuGroup>
              {record ? (
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href={editHref}>
                    <PencilIcon />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          )}
          {canUpdate && canDelete && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {own.dialogs}

      {record && canUpdate && (
        <ResourceFormSheet
          resource={resource}
          relations={relations}
          listHref={listHref}
          mode="edit"
          id={id}
          record={record}
          open={editing}
          onOpenChange={setEditing}
        />
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{trash ? `Move this ${label.toLowerCase()} to the trash?` : `Delete this ${label.toLowerCase()}?`}</AlertDialogTitle>
            <AlertDialogDescription>{trash ? `It can be restored from the trash ${keptFor(trash)}.` : "This can't be undone."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {trash ? "Move to trash" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
