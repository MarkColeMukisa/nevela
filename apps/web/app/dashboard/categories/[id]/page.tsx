// Generated once by Nevela for Category. This file is yours.
import { RecordDetail } from "@/components/dashboard/record-detail";
import categoryResource from "@/resources/category.resource";

export default async function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecordDetail resource={categoryResource} id={(await params).id} />;
}
