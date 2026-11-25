import Link from "next/link";
import { notFound } from "next/navigation";
import { storedFields } from "@flaredev/core";
import { allResources, mayDo } from "@/lib/dashboard";
import { displayValue } from "@/lib/format";
import { laravel } from "@/lib/laravel";
import { recordTitle } from "@/lib/records";
import { requireSession } from "@/lib/session";

type Row = Record<string, unknown> & { id: string };

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = allResources().find((candidate) => candidate.slug === slug);
  return { title: resource?.pluralLabel ?? "Records" };
}

/**
 * One resource's records, as many as the customer may see: Laravel narrows the list to their
 * own where the resource's policy says so. Read here; changing them is the phone's or the staff's.
 */
export default async function ResourceRecordsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> }) {
  const { slug } = await params;
  await requireSession(`/account/records/${slug}`);
  const resource = allResources().find((candidate) => candidate.slug === slug);
  if (!resource || !(await mayDo(resource, "read"))) notFound();

  const page = Math.max(1, Number((await searchParams).page) || 1);
  const response = await laravel(`${resource.slug}?perPage=25&page=${page}&sort=-createdAt`);
  if (!response.ok) notFound();
  const { data, meta } = response.body as { data: Row[]; meta: { page: number; totalPages: number; total: number } };
  // A few of what the record holds beside its title, as a line under it.
  const facts = storedFields(resource)
    .filter(([key, def]) => key !== resource.titleField && !["text", "json", "file", "belongsTo"].includes(def.kind))
    .slice(0, 3);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{resource.pluralLabel}</h2>
        <Link href="/account/records" className="text-sm text-link hover:underline">
          All records
        </Link>
      </div>
      {data.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border">
          {data.map((record) => (
            <li key={record.id}>
              <Link href={`/account/records/${resource.slug}/${encodeURIComponent(record.id)}`} className="flex flex-col gap-0.5 px-4 py-3 hover:bg-muted/50">
                <span className="text-sm font-medium">{recordTitle(resource, record)}</span>
                {facts.length > 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {facts
                      .map(([key, def]) => displayValue(def, record[key]))
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {meta.totalPages > 1 ? (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {meta.page > 1 ? <Link href={`?page=${meta.page - 1}`} className="text-link hover:underline">Previous</Link> : <span />}
          <span className="text-muted-foreground">
            Page {meta.page} of {meta.totalPages}
          </span>
          {meta.page < meta.totalPages ? <Link href={`?page=${meta.page + 1}`} className="text-link hover:underline">Next</Link> : <span />}
        </nav>
      ) : null}
    </section>
  );
}
