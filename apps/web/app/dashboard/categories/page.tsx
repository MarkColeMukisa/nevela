// Generated once by Nevela for Category. This file is yours.
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceStats } from "@/components/dashboard/resource-stats";
import { ResourceTable } from "@/components/dashboard/resource-table";
import type { SearchParams } from "@/components/dashboard/query";
import categoryResource from "@/resources/category.resource";

export const metadata = { title: categoryResource.pluralLabel };

export default async function CategoryListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <PageHeader title={categoryResource.pluralLabel} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: categoryResource.pluralLabel }]} />
      <ResourceStats resource={categoryResource} />
      <ResourceTable resource={categoryResource} searchParams={await searchParams} />
    </>
  );
}
