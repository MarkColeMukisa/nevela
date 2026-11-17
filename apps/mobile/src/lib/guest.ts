/**
 * Browsing before signing in, as on any shop: someone who hasn't signed in sees what is
 * sold, and is asked to sign in (or make an account) when they add something to the cart.
 * Where they were is kept here meanwhile, so signing in takes them back to it.
 *
 * Kept free of anything that needs the app running, so it can be tested on its own.
 */

let waiting: string | null = null;

/** Where to come back to once signed in: the thing they were about to add. Only a path of the app's own. */
export function comeBackTo(path: string): void {
  waiting = path.startsWith("/") && !path.startsWith("//") ? path : null;
}

/** Where they were, once, then forgotten. Null when they came to sign in on their own. */
export function takeComeBack(): string | null {
  const path = waiting;
  waiting = null;
  return path;
}

/** The path of a read for a guest or for someone signed in: what anyone may read is under /public. */
export function readPath(resource: { slug: string; open?: boolean }, rest = ""): string {
  return `${resource.open ? "/public" : ""}/${resource.slug}${rest}`;
}
