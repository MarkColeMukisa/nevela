// Generated once by Nevela for Product. This file is yours.
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceStats } from "@/components/dashboard/resource-stats";
import { ResourceTable } from "@/components/dashboard/resource-table";
import type { SearchParams } from "@/components/dashboard/query";
import productResource from "@/resources/product.resource";

export const metadata = { title: productResource.pluralLabel };

export default async function ProductListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <PageHeader title={productResource.pluralLabel} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: productResource.pluralLabel }]} />
      <ResourceStats resource={productResource} />
      <ResourceTable resource={productResource} searchParams={await searchParams} />
    </>
  );
}
