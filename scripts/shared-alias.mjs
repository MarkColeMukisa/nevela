// Lets the tests run code that imports "@shared/…" (packages/shared), as the apps do. The apps
// resolve the alias through their bundlers (Metro, Next) and tsconfig paths; plain Node knows
// nothing of either, so `node --import ./scripts/shared-alias.mjs --test …` teaches it. It also
// gives the shared files' own imports ("./shop") the extension the bundlers add for them.
//
// The folder is packages/shared under where Node is run: the repository's for its own tests,
// a new app's for a tutorial run from that app.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  `data:text/javascript,${encodeURIComponent(`
    const shared = ${JSON.stringify(pathToFileURL(process.cwd() + "/packages/shared/").href)};
    const ts = (name) => (/\\.[cm]?[jt]sx?$/.test(name) ? name : name + ".ts");
    export async function resolve(specifier, context, next) {
      if (specifier.startsWith("@shared/")) return next(shared + ts(specifier.slice("@shared/".length)), context);
      if (specifier.startsWith(".") && context.parentURL?.startsWith(shared)) return next(ts(specifier), context);
      return next(specifier, context);
    }
  `)}`,
);
