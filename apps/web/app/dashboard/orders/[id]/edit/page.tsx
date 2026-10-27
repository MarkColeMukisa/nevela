// Generated once by Nevela for Order. This file is yours.
import { ResourceFormPage } from "@/components/dashboard/resource-form-page";
import orderResource from "@/resources/order.resource";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={orderResource} id={(await params).id} />;
}
