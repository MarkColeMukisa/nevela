import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/site-header";
import { resourceTag } from "@/lib/cache";
import { fileUrl } from "@/lib/files";
import { displayValue } from "@/lib/format";
import { laravelPublic } from "@/lib/laravel";
import Product from "@/resources/product.resource";

export const metadata: Metadata = { title: "Shop" };

type OnSale = { id: string; name: string; slug: string; price: number; image: string | null };

/** Every product on sale, by name: what the products' public section lets anyone read. */
export default async function ShopPage() {
  const response = await laravelPublic("products?sort=name&perPage=48", { tags: [resourceTag("Product")] });
  const products = response.ok ? (response.body as { data: OnSale[] }).data : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="text-4xl md:text-5xl">Shop</h1>
        {products.length === 0 ? (
          <p className="mt-12 text-foreground-muted">Nothing is on sale yet.</p>
        ) : (
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id} className="overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-surface">
                {product.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the card size Laravel made when the picture was uploaded
                  <img src={fileUrl(product.image, "card")} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="aspect-square w-full bg-foreground/5" />
                )}
                <div className="flex flex-col gap-1 p-4">
                  <h2 className="font-medium">{product.name}</h2>
                  <p className="text-sm text-foreground-muted">{displayValue(Product.fields.price, product.price)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
