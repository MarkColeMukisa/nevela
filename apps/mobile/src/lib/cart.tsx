import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useAuth } from "./auth";
import { may, useResources } from "./resources";
import { addToCart, cartCount, clampQuantity, findShop, setQuantity, type CartLine, type Shop } from "./shop";
import { site } from "./site";

/**
 * The cart: what the customer means to buy, kept on the phone.
 *
 * It belongs to the account. It is kept between launches under that account's id, and what
 * a phone held for someone is gone when they sign out, so the next person on it starts empty.
 * It is the customer's own list. The order Laravel makes from it is what counts: the prices
 * are the products' at that moment, and the total is Laravel's.
 */

interface CartValue {
  lines: CartLine[];
  /** How many things are in it, counting each of a kind. */
  count: number;
  add: (item: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  /**
   * Bring what it shows up to date with the shop: a price that changed, a product that has gone.
   * Given the cart as it is when the answer arrives, so a quantity changed meanwhile isn't lost.
   */
  refresh: (apply: (current: CartLine[]) => CartLine[]) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue | null>(null);

const keyFor = (userId: string) => `nevela.cart.${userId}`;

/** What was kept, if it is still a cart: anything else is an empty one. */
function parse(stored: string | null): CartLine[] {
  try {
    const found: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(found)) return [];
    return found
      .filter((line): line is CartLine => typeof line?.id === "string" && typeof line?.title === "string" && typeof line?.quantity === "number")
      .map((line) => ({
        id: line.id,
        title: line.title,
        quantity: clampQuantity(line.quantity),
        price: typeof line.price === "number" ? line.price : null,
        image: typeof line.image === "string" ? line.image : null,
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [lines, setLines] = useState<CartLine[]>([]);
  // Whose cart this is, and whether theirs has been read yet: nothing is written until it has.
  const owner = useRef<string | null>(null);
  const ready = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    const previous = owner.current;
    owner.current = userId;
    ready.current = null;
    // Never show another account's cart while this one's is being read.
    setLines([]);
    if (userId === null) {
      // Signed out: what the phone held for them goes.
      if (previous) AsyncStorage.removeItem(keyFor(previous)).catch(() => undefined);
      return;
    }
    AsyncStorage.getItem(keyFor(userId))
      .then((stored) => {
        if (!live || owner.current !== userId) return;
        setLines(parse(stored));
        ready.current = userId;
      })
      .catch(() => {
        if (live && owner.current === userId) ready.current = userId;
      });
    return () => {
      live = false;
    };
  }, [userId]);

  useEffect(() => {
    if (userId === null || ready.current !== userId) return;
    AsyncStorage.setItem(keyFor(userId), JSON.stringify(lines)).catch(() => undefined);
  }, [lines, userId]);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: cartCount(lines),
      add: (item, quantity = 1) => setLines((current) => addToCart(current, item, quantity)),
      setQuantity: (id, quantity) => setLines((current) => setQuantity(current, id, quantity)),
      remove: (id) => setLines((current) => current.filter((line) => line.id !== id)),
      refresh: (apply) => setLines(apply),
      clear: () => setLines([]),
    }),
    [lines],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartValue {
  const value = use(CartContext);
  if (!value) throw new Error("useCart() needs <CartProvider> above it.");
  return value;
}

/**
 * The shop for the signed-in person, or null: when the resources have no shop the phone can
 * take an order for (lib/shop.ts), or this person may not see what is sold or place an order.
 * A customer without a shop is shown what they may browse instead.
 */
export function useShop(): Shop | null {
  const { all } = useResources();
  const { user } = useAuth();
  return useMemo(() => {
    const found = findShop(all, site.shop);
    return found && may(user, found.catalogue, "view") && may(user, found.orders, "create") ? found : null;
  }, [all, user]);
}

/** Whether this person may look at the orders they have placed. */
export function useCanTrack(shop: Shop | null): boolean {
  const { user } = useAuth();
  return Boolean(shop && may(user, shop.orders, "view"));
}
