// Generated once by Nevela for OrderItem. This file is yours.
import { ResourceFormPage } from "@/components/dashboard/resource-form-page";
import orderItemResource from "@/resources/order-item.resource";

export default async function EditOrderItemPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={orderItemResource} id={(await params).id} />;
}
