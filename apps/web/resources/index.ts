// Registry of every resource descriptor (maintained by `php artisan nevela:generate`).
// nevela:generated:start hash=e423a3bd5e6f
import categoryResource from "./category.resource";
import productResource from "./product.resource";

export { categoryResource, productResource };
export const resources = [categoryResource, productResource] as const;
// nevela:generated:end
