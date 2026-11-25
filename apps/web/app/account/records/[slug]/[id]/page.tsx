import Link from "next/link";
import { notFound } from "next/navigation";
import { storedFields } from "@flaredev/core";
import { allResources, mayDo } from "@/lib/dashboard";
import { fileName, fileUrl, isPrivateKey, privateFileUrl } from "@/lib/files";
import { displayValue } from "@/lib/format";
import { fileKeys, filesOf } from "@/lib/gallery";
import { laravel } from "@/lib/laravel";
import { recordTitle } from "@/lib/records";
import { isRich } from "@/lib/rich";
import { requireSession } from "@/lib/session";

/**
 * One of the customer's records, every field as they read it. Laravel answers only for a
 * record the resource's policy lets them view: anyone else's is not found.
 */
export default async function RecordPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  await requireSession(`/account/records/${slug}/${id}`);
  const resource = allResources().find((candidate) => candidate.slug === slug);
  if (!resource || !(await mayDo(resource, "read"))) notFound();

  const response = await laravel(`${resource.slug}/${encodeURIComponent(id)}`);
  if (!response.ok) notFound();
  const record = response.body as Record<string, unknown> & { id: string };
  const fields = storedFields(resource).filter(([key]) => key !== resource.titleField);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link href={`/account/records/${resource.slug}`} className="text-sm text-link hover:underline">
          {resource.pluralLabel}
        </Link>
        <h2 className="text-lg font-semibold tracking-tight">{recordTitle(resource, record)}</h2>
      </div>
      <dl className="grid gap-x-8 gap-y-4 rounded-xl border p-4 sm:grid-cols-2">
        {fields.map(([key, def]) => {
          const value = record[key];
          let content: React.ReactNode = displayValue(def, value) || "—";
          if (isRich(def) && typeof value === "string" && value) {
            // Shown as it was written. Laravel cleaned it when it was saved and again when it was read.
            content = <div className="rich-text" dangerouslySetInnerHTML={{ __html: value }} />;
          } else if (filesOf(def)) {
            const keys = fileKeys(value);
            content = keys.length === 0 ? "—" : keys.map((file) => <FileLink key={file} href={fileUrl(file)} name={fileName(file)} />);
          } else if (def.kind === "file" && typeof value === "string" && value) {
            content = <FileLink href={isPrivateKey(value) ? privateFileUrl(resource.slug, record.id, key) : fileUrl(value)} name={fileName(value)} />;
          } else if (def.kind === "json" && value != null) {
            content = <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{JSON.stringify(value, null, 2)}</pre>;
          }
          const wide = def.kind === "text" || def.kind === "json";
          return (
            <div key={key} className={wide ? "flex flex-col gap-1 sm:col-span-2" : "flex flex-col gap-1"}>
              <dt className="text-xs text-muted-foreground">{def.label}</dt>
              <dd className="text-sm">{content}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function FileLink({ href, name }: { href: string; name: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mr-3 text-link hover:underline">
      {name}
    </a>
  );
}
