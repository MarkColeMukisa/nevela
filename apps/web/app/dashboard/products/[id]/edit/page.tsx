// Generated once by Nevela for Product. This file is yours.
import { ResourceFormPage } from "@/components/dashboard/resource-form-page";
import productResource from "@/resources/product.resource";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={productResource} id={(await params).id} />;
}
