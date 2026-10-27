// Registry of every resource descriptor (maintained by `php artisan nevela:generate`).
// nevela:generated:start hash=62d29ee18760
import categoryResource from "./category.resource";
import orderResource from "./order.resource";
import orderItemResource from "./order-item.resource";
import productResource from "./product.resource";

export { categoryResource, orderResource, orderItemResource, productResource };
export const resources = [categoryResource, orderResource, orderItemResource, productResource] as const;

/** What a resource has beyond its fields. Read through lib/extras.ts. */
export const extras: Record<string, unknown> = {
    "Order": {
        "items": {
            "resource": "OrderItem",
            "field": "orderId"
        }
    }
};
// nevela:generated:end
