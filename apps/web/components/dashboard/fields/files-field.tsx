"use client";

import { useId, useRef, useState } from "react";
import { FileIcon, PlusIcon, XIcon } from "lucide-react";
import { fileMaxBytes, mimeTypesFor, type FileField as FileFieldDef } from "@flaredev/core";
import { createUploadUrlAction } from "@/app/dashboard/actions";
import { Progress } from "@/components/ui/progress";
import { fileKeys, fileName, fileUrl, isImageKey } from "@/lib/files";
import { cn } from "@/lib/utils";
import { checkFile, describeAccept, formatBytes, put } from "./file-field";

/** At most this many in one field, as Laravel has it (Field::MAX_FILES). */
const MOST = 20;

interface Props {
  id: string;
  /** The form's value: the JSON of the list of keys, or "" for none. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  label: string;
  /** What it takes, as a file field's `accept`: ["image"]. */
  accept: string[];
  resourceName: string;
  fieldKey: string;
  /** Told when the uploads start and when the last one ends, so the form waits for them. */
  onBusyChange?: (busy: boolean) => void;
}

type Upload = { name: string; loaded: number; total: number; left: number; abort: () => void };

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A field of several files, gallery:files(image): the ones it has, each with a way to take
 * it out, and a tile to add more, chosen or dropped several at a time. They are sent one
 * after another, each checked in the browser first as a single file is (Laravel repeats
 * every check), and each key Laravel answers with joins the list in the order chosen.
 */
export function FilesField({ id, value, onChange, invalid, disabled, label, accept, resourceName, fieldKey, onBusyChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("");

  const keys = fileKeys(value);
  const maxBytes = fileMaxBytes({ kind: "file", required: false, accept } as unknown as FileFieldDef);
  const room = MOST - keys.length;
  const busy = upload !== null;
  const help = `${capitalize(describeAccept(accept))}, up to ${formatBytes(maxBytes)} each, ${MOST} at most`;
  const emit = (next: string[]) => onChange(next.length === 0 ? "" : JSON.stringify(next));

  async function add(files: File[]) {
    const problems: string[] = [];
    if (files.length > room) problems.push(room === 0 ? `${label} holds ${MOST} files at most.` : `Only ${room} more fit: ${label} holds ${MOST} at most.`);
    let list = keys;
    const chosen = files.slice(0, Math.max(0, room));
    onBusyChange?.(true);
    for (const [index, file] of chosen.entries()) {
      const problem = await checkFile(file, label, accept, maxBytes);
      if (problem) {
        problems.push(problem);
        continue;
      }
      const signal: { abort?: () => void } = {};
      setUpload({ name: file.name, loaded: 0, total: file.size, left: chosen.length - index - 1, abort: () => signal.abort?.() });
      setStatus(`Uploading ${file.name}…`);
      try {
        const signed = await createUploadUrlAction(resourceName, fieldKey, { name: file.name, type: file.type || "application/octet-stream", size: file.size });
        if (!signed.ok) throw new Error(signed.error);
        const stored = await put(signed.data.url, file, (loaded) => setUpload((current) => current && { ...current, loaded }), signal);
        if (stored) {
          list = [...list, stored];
          emit(list);
        }
        setStatus(`${file.name} uploaded`);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          setStatus("Upload cancelled");
          break;
        }
        problems.push(cause instanceof Error ? cause.message : `${file.name} couldn't be uploaded.`);
      }
    }
    setUpload(null);
    onBusyChange?.(false);
    setErrors(problems);
    if (input.current) input.current.value = "";
  }

  function remove(key: string) {
    setErrors([]);
    emit(keys.filter((other) => other !== key));
    setStatus(`${fileName(key)} removed`);
  }

  const percent = upload && upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0;
  const blocked = disabled || busy || room <= 0;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={mimeTypesFor(accept as Parameters<typeof mimeTypesFor>[0]).join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={blocked}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) void add(files);
        }}
      />

      <ul
        className={cn("flex flex-wrap gap-2", dragging && "rounded-lg ring-2 ring-primary ring-offset-2")}
        aria-label={label}
        onDragOver={(event) => {
          if (blocked) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const files = [...event.dataTransfer.files];
          if (files.length > 0 && !blocked) void add(files);
        }}
      >
        {keys.map((key) => (
          <li key={key} className="group relative size-24 overflow-hidden rounded-md border bg-muted">
            {isImageKey(key) ? (
              // eslint-disable-next-line @next/next/no-img-element -- a thumbnail already the right size
              <img src={fileUrl(key, "thumb")} alt={fileName(key)} className="size-full object-cover" loading="lazy" decoding="async" />
            ) : (
              <a href={fileUrl(key)} target="_blank" rel="noreferrer" className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground hover:text-foreground">
                <FileIcon aria-hidden="true" className="size-5" />
                <span className="line-clamp-2 break-all">{fileName(key)}</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => remove(key)}
              disabled={disabled || busy}
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-background/90 text-foreground shadow-sm outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <XIcon aria-hidden="true" className="size-3.5" />
              <span className="sr-only">Remove {fileName(key)}</span>
            </button>
          </li>
        ))}
        {room > 0 && (
          <li className="size-24">
            <button
              id={id}
              type="button"
              onClick={() => input.current?.click()}
              disabled={blocked}
              aria-describedby={helpId}
              aria-invalid={invalid || errors.length > 0 || undefined}
              className={cn(
                "flex size-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground transition-colors outline-none motion-reduce:transition-none",
                "hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                (invalid || errors.length > 0) && "border-destructive",
              )}
            >
              <PlusIcon aria-hidden="true" className="size-5" />
              {keys.length === 0 ? "Add files" : "Add more"}
            </button>
          </li>
        )}
      </ul>

      {upload && (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{upload.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {percent}%{upload.left > 0 ? ` · ${upload.left} more to go` : ""}
              </span>
            </div>
            <Progress value={percent} aria-label={`Uploading ${upload.name}`} />
          </div>
          <button type="button" onClick={upload.abort} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      )}

      <span id={helpId} className="text-xs text-muted-foreground">
        {help}. Drop them on the tiles or choose several at once.
      </span>
      {errors.map((problem) => (
        <p key={problem} role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ))}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
