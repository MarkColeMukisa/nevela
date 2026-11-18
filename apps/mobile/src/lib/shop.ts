import type { FieldSpec, Resource } from "./resources";

/**
 * The shop: what the customer app is drawn from, found in the resources the API describes.
 *
 * Nothing is written down for it. A shop is the shape the line items guide already teaches:
 * an order resource whose `items` are lines, and lines that point at what is sold. Order,
 * OrderItem and Product is one; so is Booking, BookingLine and Service. Where an app differs,
 * `site.shop` in lib/site.ts says how.
 *
 * Kept free of anything that needs the app running, so it can be tested on its own.
 */

/** What an app can say about its shop where it isn't the usual shape. Each is found when left out. */
export interface ShopSettings {
  /** The order's fields the checkout asks for, in order. */
  checkout?: string[];
  /** Sent with every order exactly as they are, for a required field the customer shouldn't be asked: `{ status: "pending" }`. */
  send?: Record<string, unknown>;
  /** The catalogue's yes/no field that says a thing can be ordered. */
  available?: string;
  /** The catalogue's relation that its things are grouped by, shown as chips. */
  category?: string;
}

/**
 * What is sold, and how to show it: all a guest needs to browse, with no order to place.
 * A Shop is a Catalogue with the order beside it.
 */
export type Catalogue = Pick<Shop, "catalogue" | "title" | "price" | "image" | "description" | "category" | "available">;

export interface Shop {
  /** The order resource, and the resource its lines are. */
  orders: Resource;
  lines: Resource;
  /** The line's field that points back at its order, and the one that points at what was bought. */
  link: string;
  product: string;
  /** What is sold. */
  catalogue: Resource;
  /** The line's quantity field. */
  quantity: string;
  /** The catalogue's fields the shop shows, where it has them. */
  title: string;
  price: string | null;
  image: string | null;
  description: string | null;
  category: string | null;
  /** The catalogue's yes/no field that says a thing can be ordered, or null. */
  available: string | null;
  /** The order's fields the checkout asks for, and what is sent without asking. */
  checkout: string[];
  send: Record<string, unknown>;
}

const QUANTITY = /^(quantity|qty)$/i;
const AVAILABLE = /^(active|available|availability|in_?stock|published|enabled)$/i;
/** An order's status, and its like: the shop's to decide. A customer is never asked for one. */
const STATUS = /^(status|state|stage)$/i;
const NAME = /^(customer|customerName|name|fullName)$/i;

/** The field that names a record: the one given, else its first string field. */
export function titleFieldOf(resource: Resource): string {
  return resource.titleField ?? Object.entries(resource.fields).find(([, field]) => field.kind === "string")?.[0] ?? "id";
}

const hasDefault = (field: FieldSpec) => field.default !== undefined && field.default !== null;
/** Whether a field has to be given when an order is made: it is required, nothing fills it in, and nothing is its default. */
const owed = (field: FieldSpec) => field.required !== false && !hasDefault(field) && !field.auto && !field.from;

/** Whether the phone has a control for a field. A file or JSON isn't one it can fill for a customer. */
const askable = (field: FieldSpec) => field.kind !== "file" && field.kind !== "json";

/**
 * The shop in these resources, or null when there isn't one the phone can take an order for.
 *
 * It is null rather than half a shop: a catalogue to browse and no way to buy would be worse
 * than the plain list the customer app shows without one. In particular, a field an order has
 * to have that the customer can't be asked (a status with no default) leaves no shop, until the
 * descriptor gives it a default or `site.shop.send` supplies it.
 */
export function findShop(all: Resource[], settings: ShopSettings = {}): Shop | null {
  const byName = new Map(all.map((resource) => [resource.name, resource]));

  for (const orders of all) {
    const lines = orders.items ? byName.get(orders.items) : undefined;
    if (!lines) continue;

    const links = Object.entries(lines.fields).filter(([, field]) => field.kind === "belongsTo" && field.target);
    const link = links.find(([, field]) => field.target === orders.name)?.[0];
    const bought = links.find(([name, field]) => name !== link && field.target !== orders.name && byName.has(field.target as string));
    const quantity = Object.entries(lines.fields).find(([name, field]) => (field.kind === "int" || field.kind === "float") && QUANTITY.test(name))?.[0];
    if (!link || !bought || !quantity) continue;

    const linePrice = Object.entries(lines.fields).find(([, field]) => field.kind === "float" && field.format === "money");
    // The line's price is usually copied from the thing bought ("productId.price"): that is the price to show.
    const copied = linePrice?.[1].from?.startsWith(`${bought[0]}.`) ? linePrice[1].from.slice(bought[0].length + 1) : null;
    const { catalogue, title, price, image, description, category, available } = catalogueOf(byName.get(bought[1].target as string) as Resource, byName, settings, copied);

    const send = settings.send ?? {};
    const checkout =
      settings.checkout ??
      Object.entries(orders.fields)
        .filter(([name, field]) => {
          // Whose order it is, Laravel knows: it is the signed-in person's.
          if (field.auto || field.from || name === orders.owner || !askable(field)) return false;
          // The order's total comes from its lines.
          if (field.kind === "float" && field.format === "money") return false;
          if (name in send) return false;
          // Never asked, whatever it holds. If the order has to have one and nothing gives it, there is no shop (below).
          if (STATUS.test(name) && field.kind === "enum") return false;
          return true;
        })
        .map(([name]) => name);

    // Everything an order has to have is either asked for or sent. If not, there is no order to place.
    const missing = Object.entries(orders.fields).some(([name, field]) => owed(field) && !checkout.includes(name) && !(name in send) && name !== orders.owner);
    const unaskable = checkout.some((name) => !orders.fields[name] || !askable(orders.fields[name]));
    if (missing || unaskable) continue;

    return { orders, lines, link, product: bought[0], catalogue, quantity, title, price, image, description, category, available, checkout, send };
  }
  return null;
}

/** How a catalogue is shown: its title, price, picture, description, category and "can be ordered" fields, where it has them. */
function catalogueOf(catalogue: Resource, byName: Map<string, Resource>, settings: ShopSettings, copiedPrice: string | null = null): Catalogue {
  const money = Object.entries(catalogue.fields).find(([, field]) => field.kind === "float" && field.format === "money")?.[0] ?? null;
  const price = copiedPrice && catalogue.fields[copiedPrice] ? copiedPrice : money;
  const images = Object.entries(catalogue.fields).filter(([, field]) => field.kind === "file" && field.accept?.includes("image"));
  const image = (images.find(([, field]) => !field.multiple) ?? images[0])?.[0] ?? null;
  const description = Object.entries(catalogue.fields).find(([, field]) => field.kind === "text")?.[0] ?? null;
  const category = settings.category ?? Object.entries(catalogue.fields).find(([, field]) => field.kind === "belongsTo" && byName.has(field.target as string))?.[0] ?? null;
  const available = settings.available ?? Object.entries(catalogue.fields).find(([name, field]) => field.kind === "boolean" && AVAILABLE.test(name))?.[0] ?? null;
  return { catalogue, title: titleFieldOf(catalogue), price, image, description, category, available };
}

/**
 * What a guest may browse: the resource Laravel says is sold, from what anyone may read
 * (GET public/_nevela/resources). Null when nothing sold is open to them: then the app opens
 * on signing in, as an app with no public shop always has.
 */
export function findCatalogue(open: Resource[], settings: ShopSettings = {}): Catalogue | null {
  const sold = open.find((resource) => resource.sold);
  if (!sold) return null;
  // What is on the shelf is the model's publicQuery to say, and the public list refuses a
  // filter on a field it doesn't open: an override naming one is left to that, not sent.
  const guest: ShopSettings = {
    ...settings,
    available: settings.available && sold.fields[settings.available] ? settings.available : undefined,
    category: settings.category && sold.fields[settings.category] ? settings.category : undefined,
  };
  return catalogueOf(sold, new Map(open.map((resource) => [resource.name, resource])), guest, sold.price ?? null);
}

/** Which of the signed-in person's details an order field starts out with: their name for the customer's, their email for an email. */
export function prefillFrom(field: FieldSpec, name: string): "name" | "email" | null {
  if (field.kind === "string" && field.format === "email") return "email";
  if (field.kind === "string" && !field.format && NAME.test(name)) return "name";
  return null;
}

// --- the cart

/** One thing in the cart, with what is needed to show it without asking again. */
export interface CartLine {
  /** The id of what is bought. */
  id: string;
  quantity: number;
  title: string;
  price: number | null;
  /** The address of its small picture, or null. */
  image: string | null;
}

/** The most of one thing in a cart: more is a typing mistake, and the API takes at most 500 lines. */
export const MOST_OF_ONE = 99;

export const clampQuantity = (quantity: number): number => Math.min(MOST_OF_ONE, Math.max(1, Math.round(Number.isFinite(quantity) ? quantity : 1)));

/** Put something in the cart, or one more of it if it is there. */
export function addToCart(lines: CartLine[], item: Omit<CartLine, "quantity">, quantity = 1): CartLine[] {
  const found = lines.find((line) => line.id === item.id);
  if (!found) return [...lines, { ...item, quantity: clampQuantity(quantity) }];
  return lines.map((line) => (line.id === item.id ? { ...line, ...item, quantity: clampQuantity(line.quantity + quantity) } : line));
}

/** Change how many; none is taking it out. */
export function setQuantity(lines: CartLine[], id: string, quantity: number): CartLine[] {
  return quantity < 1 ? lines.filter((line) => line.id !== id) : lines.map((line) => (line.id === id ? { ...line, quantity: clampQuantity(quantity) } : line));
}

/** What the cart comes to, and whether every line had a price to add up. The server works out the real one. */
export function cartTotal(lines: CartLine[]): { amount: number; complete: boolean } {
  return {
    amount: lines.reduce((sum, line) => sum + (line.price ?? 0) * line.quantity, 0),
    complete: lines.every((line) => line.price !== null),
  };
}

export const cartCount = (lines: CartLine[]): number => lines.reduce((sum, line) => sum + line.quantity, 0);

/** The lines as the API takes them, with the order: only what was bought and how many. The price is the product's, copied by Laravel. */
export function orderLines(shop: Shop, lines: CartLine[]): Record<string, unknown>[] {
  return lines.map((line) => ({ [shop.product]: line.id, [shop.quantity]: line.quantity }));
}

/** The order's total: a money field named like one, else the first money field. */
export function totalFieldOf(orders: Resource): [string, FieldSpec] | undefined {
  const money = Object.entries(orders.fields).filter(([, field]) => field.kind === "float" && field.format === "money");
  return money.find(([name]) => /^(grand_?total|order_?total|total|amount)$/i.test(name)) ?? money[0];
}

/** A stage that ends an order some other way than the trail's: it is not "done", and nothing after it is. */
export const OFF_THE_TRAIL = /cancel|reject|declin|fail|refund|void|expire/i;

/** What a customer is told when the thing they chose can't be ordered, whatever the reason: deleted, in the trash, not theirs to see. */
export const NOT_AVAILABLE = "This isn't available any more. Take it out of your cart to carry on.";

/**
 * Laravel's complaints about an order, shared out: a mistake in a line arrives by its place
 * ("items.1.quantity"), and belongs to the cart's second line. The rest are about the order.
 *
 * Given the line's field that points at what was bought, a complaint about it is put as
 * NOT_AVAILABLE: Laravel's own words ("restore it, or choose another") are for staff.
 */
export function sortIssues(
  issues: { path: string; message: string }[],
  product?: string,
): { lines: Record<number, string[]>; order: { path: string; message: string }[] } {
  const lines: Record<number, string[]> = {};
  const order: { path: string; message: string }[] = [];
  for (const issue of issues) {
    const match = /^items\.(\d+)(?:\.(.*))?$/.exec(issue.path);
    if (!match) {
      order.push(issue);
      continue;
    }
    const message = product !== undefined && match[2] === product ? NOT_AVAILABLE : issue.message;
    const mine = (lines[Number(match[1])] ??= []);
    if (!mine.includes(message)) mine.push(message);
  }
  return { lines, order };
}
