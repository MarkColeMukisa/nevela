// Generated once by Nevela for Order. This file is yours.
import { RecordDetail } from "@/components/dashboard/record-detail";
import orderResource from "@/resources/order.resource";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecordDetail resource={orderResource} id={(await params).id} />;
}
