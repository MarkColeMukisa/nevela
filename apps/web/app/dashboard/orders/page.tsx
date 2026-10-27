// Generated once by Nevela for Order. This file is yours.
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceStats } from "@/components/dashboard/resource-stats";
import { ResourceTable } from "@/components/dashboard/resource-table";
import type { SearchParams } from "@/components/dashboard/query";
import orderResource from "@/resources/order.resource";

export const metadata = { title: orderResource.pluralLabel };

export default async function OrderListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <PageHeader title={orderResource.pluralLabel} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: orderResource.pluralLabel }]} />
      <ResourceStats resource={orderResource} />
      <ResourceTable resource={orderResource} searchParams={await searchParams} />
    </>
  );
}
