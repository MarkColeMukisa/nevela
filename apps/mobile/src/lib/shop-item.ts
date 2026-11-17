import { pictureUrl } from "@/components/pictures";

import { filesOf, type StoredFile } from "./format";
import type { ResourceRecord } from "./resources";
import type { CartLine, Shop } from "./shop";

/** One thing the shop sells, read from a record of the catalogue. */

export function titleOf(shop: Shop, record: ResourceRecord): string {
  const value = record[shop.title];
  return value === null || value === undefined || value === "" ? "Untitled" : String(value);
}

export function priceOf(shop: Shop, record: ResourceRecord): number | null {
  const value = shop.price ? record[shop.price] : null;
  return value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? null : Number(value);
}

/** Whether it can be ordered: the shop's yes/no field says so, or there is none to say otherwise. */
export function isAvailable(shop: Shop, record: ResourceRecord): boolean {
  return shop.available === null ? true : record[shop.available] !== false && record[shop.available] !== 0;
}

/** Its first picture, as Laravel sent it, or null. */
export function pictureOf(shop: Shop, record: ResourceRecord): StoredFile | null {
  if (!shop.image) return null;
  return filesOf(shop.image, shop.catalogue.fields[shop.image], record)[0] ?? null;
}

/** What the cart keeps of it: enough to show the line without asking again. */
export function cartItemOf(shop: Shop, record: ResourceRecord): Omit<CartLine, "quantity"> {
  return { id: record.id, title: titleOf(shop, record), price: priceOf(shop, record), image: pictureUrl(pictureOf(shop, record), "thumb") };
}

/** A cart line's picture, as the picture component takes it. */
export function lineFile(line: CartLine): StoredFile | null {
  return line.image ? { url: line.image, name: line.title, mime: "image/webp" } : null;
}
