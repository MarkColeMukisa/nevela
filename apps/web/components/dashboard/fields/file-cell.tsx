import { FileIcon } from "lucide-react";
import { fileName, fileUrl, isImageKey } from "@/lib/files";

/**
 * A stored file in a table cell or a record's detail.
 *
 * An image becomes its thumbnail: the small rendition Laravel made when the file was
 * uploaded, so a table of fifty products downloads fifty small pictures, not fifty
 * full-size ones. Anything else is its filename, which is the useful part of a key
 * nobody wants to read in full.
 */
export function FileCell({ value, size = 36 }: { resourceName?: string; fieldKey?: string; value: string; size?: number }) {
  if (!isImageKey(value)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <FileIcon aria-hidden="true" className="size-3.5" />
        <span className="max-w-[16ch] truncate">{fileName(value)}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-md border bg-muted align-middle"
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- already the right size; next/image would resize it again */}
      <img src={fileUrl(value, "thumb")} alt="" width={size} height={size} loading="lazy" decoding="async" className="size-full object-cover" />
    </span>
  );
}
