/**
 * What the app calls itself: the sign-in screen and the home screen read it. The name and
 * tagline are the brand's, in packages/shared/brand.ts, which the dashboard reads too: change
 * them there. The name under the icon on the phone is `name` in app.json.
 */
import { brand } from "@shared/brand";

import type { ShopSettings } from "./shop";

export const site = {
  name: brand.name,
  tagline: brand.tagline,
  /**
   * The shop customers see is found in your resources: an order with lines that point at
   * what is sold (Order, OrderItem and Product). Say here how yours differs, if it does:
   *
   *   shop: { send: { status: "pending" }, checkout: ["customer", "phone"], available: "active", category: "categoryId" }
   *
   * `send` is for a field every order has to have that customers shouldn't be asked, such as a
   * status that has no default. Left out, the customer app shows what they may browse instead.
   */
  shop: {} as ShopSettings,
};
