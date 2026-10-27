// Generated once by Nevela for OrderItem. This file is yours.
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceStats } from "@/components/dashboard/resource-stats";
import { ResourceTable } from "@/components/dashboard/resource-table";
import type { SearchParams } from "@/components/dashboard/query";
import orderItemResource from "@/resources/order-item.resource";

export const metadata = { title: orderItemResource.pluralLabel };

export default async function OrderItemListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <PageHeader title={orderItemResource.pluralLabel} crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: orderItemResource.pluralLabel }]} />
      <ResourceStats resource={orderItemResource} />
      <ResourceTable resource={orderItemResource} searchParams={await searchParams} />
    </>
  );
}
