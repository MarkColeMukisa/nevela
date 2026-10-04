// Generated once by Nevela for Category. This file is yours.
import { ResourceFormPage } from "@/components/dashboard/resource-form-page";
import categoryResource from "@/resources/category.resource";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  return <ResourceFormPage resource={categoryResource} id={(await params).id} />;
}
