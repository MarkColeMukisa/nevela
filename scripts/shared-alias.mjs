// Lets the tests run code that imports "@shared/…" (packages/shared), as the apps do. The apps
// resolve the alias through their bundlers (Metro, Next) and tsconfig paths; plain Node knows
// nothing of either, so `node --import ./scripts/shared-alias.mjs --test …` teaches it. It also
// gives the shared files' own imports ("./shop") the extension the bundlers add for them.
import { register } from "node:module";

register(
  `data:text/javascript,${encodeURIComponent(`
    const shared = ${JSON.stringify(new URL("../packages/shared/", import.meta.url).href)};
    const ts = (name) => (/\\.[cm]?[jt]sx?$/.test(name) ? name : name + ".ts");
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith("@shared/")) return next(shared + ts(specifier.slice("@shared/".length)), context);
      if (specifier.startsWith(".") && context.parentURL?.startsWith(shared)) return next(ts(specifier), context);
      return next(specifier, context);
    }
  `)}`,
);
