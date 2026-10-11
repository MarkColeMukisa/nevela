// Registry of every resource descriptor (maintained by `php artisan nevela:generate`).
// nevela:generated:start hash=1687e7b737b4
import categoryResource from "./category.resource";
import productResource from "./product.resource";

export { categoryResource, productResource };
export const resources = [categoryResource, productResource] as const;

/** What a resource has beyond its fields. Read through lib/extras.ts. */
export const extras: Record<string, unknown> = {};
// nevela:generated:end
