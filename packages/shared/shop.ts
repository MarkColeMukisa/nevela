// Whether the app has a shop, and which resources it is made of, found in the resources
// themselves. Nevela's: the dashboard, the phone app and the Laravel API (Nevela::shop) find
// a shop by this same rule.
//
// A shop is the shape the line items guide teaches: an order resource whose `items` are lines,
// and lines that point back at the order and at what is sold, with a quantity. Order,
// OrderItem and Product is one; so is Booking, BookingLine and Service.

/** What the rule reads of a field: the dashboard's and the API's descriptions both have it. */
export interface ShapeField {
  kind: string;
  target?: string | null;
  format?: string | null;
}

/** What the rule reads of a resource. */
export interface ShapeResource {
  name: string;
  /** The resource its lines are, for one that has lines. */
  items?: string | null;
  fields: Record<string, ShapeField>;
}

export interface ShopShape<R extends ShapeResource> {
  /** The order resource, and the resource its lines are. */
  orders: R;
  lines: R;
  /** The line's field that points back at its order, and the one that points at what was bought. */
  link: string;
  product: string;
  /** What is sold. */
  catalogue: R;
  /** The line's quantity field. */
  quantity: string;
}

const QUANTITY = /^(quantity|qty)$/i;

/** Every order-shaped resource among these, in order: a client that needs more than the shape (a checkout) takes the first that suits it. */
export function shopShapes<R extends ShapeResource>(all: R[]): ShopShape<R>[] {
  const byName = new Map(all.map((resource) => [resource.name, resource]));
  const found: ShopShape<R>[] = [];
  for (const orders of all) {
    const lines = orders.items ? byName.get(orders.items) : undefined;
    if (!lines) continue;
    const links = Object.entries(lines.fields).filter(([, field]) => field.kind === "belongsTo" && field.target);
    const link = links.find(([, field]) => field.target === orders.name)?.[0];
    const bought = links.find(([name, field]) => name !== link && field.target !== orders.name && byName.has(field.target as string));
    const quantity = Object.entries(lines.fields).find(([name, field]) => (field.kind === "int" || field.kind === "float") && QUANTITY.test(name))?.[0];
    if (!link || !bought || !quantity) continue;
    found.push({ orders, lines, link, product: bought[0], catalogue: byName.get(bought[1].target as string) as R, quantity });
  }
  return found;
}

/** The shop among these resources, or null: the first order-shaped one. */
export function shopShape<R extends ShapeResource>(all: R[]): ShopShape<R> | null {
  return shopShapes(all)[0] ?? null;
}
