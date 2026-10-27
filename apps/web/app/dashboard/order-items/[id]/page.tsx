// Generated once by Nevela for OrderItem. This file is yours.
import { RecordDetail } from "@/components/dashboard/record-detail";
import orderItemResource from "@/resources/order-item.resource";

export default async function OrderItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecordDetail resource={orderItemResource} id={(await params).id} />;
}
