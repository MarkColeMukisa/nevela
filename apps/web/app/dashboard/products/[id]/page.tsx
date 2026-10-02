// Generated once by Nevela for Product. This file is yours.
import { RecordDetail } from "@/components/dashboard/record-detail";
import productResource from "@/resources/product.resource";

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <RecordDetail resource={productResource} id={(await params).id} />;
}
