import Link from "next/link";
import { notFound } from "next/navigation";
import { visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Your records" };

/**
 * What the app shares with this customer: each resource their role may view. Which of its
 * records are theirs is Laravel's to say, by the resource's policy, on every request.
 */
export default async function RecordsPage() {
  await requireSession("/account/records");
  const resources = await visibleResources();
  if (resources.length === 0) notFound();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Your records</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {resources.map((resource) => (
          <li key={resource.slug}>
            <Link href={`/account/records/${resource.slug}`} className="flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50">
              {resource.pluralLabel}
              <span aria-hidden="true" className="text-muted-foreground">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
