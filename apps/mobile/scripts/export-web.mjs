// The web version, built into dist/ for a static host: `npm run export:web`.
//
// Expo puts the icon fonts under dist/assets/node_modules/… (or __node_modules/.pnpm/…
// with pnpm), and hosts that skip folders called node_modules, or starting with a dot,
// when they upload (Sevalla's static sites do) leave every icon a box. So each of those
// files is moved to dist/assets/vendor/, under its own name, which already carries a hash
// of its contents, and the bundles are pointed at it.
//
// Serve dist/ with index.html as the error page too, so an address inside the app loads.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

const dist = "dist";
const assets = join(dist, "assets");
const vendor = join(assets, "vendor");
execSync("npx expo export -p web", { stdio: "inherit" });

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

// Every asset under a node_modules folder: its address in the bundles, and where it goes.
const moves = new Map();
for (const folder of ["node_modules", "__node_modules"]) {
  const from = join(assets, folder);
  if (!existsSync(from)) continue;
  for (const file of files(from)) {
    const address = `/${relative(dist, file).split(sep).join("/")}`;
    const target = `/assets/vendor/${basename(file)}`;
    if ([...moves.values()].includes(target)) throw new Error(`Two assets are both called ${basename(file)}.`);
    moves.set(address, target);
    mkdirSync(vendor, { recursive: true });
    renameSync(file, join(dist, target));
  }
  rmSync(from, { recursive: true, force: true });
}

if (moves.size > 0) {
  let changed = 0;
  for (const file of files(dist).filter((f) => /\.(js|html|css|json)$/.test(f))) {
    let text = readFileSync(file, "utf8");
    const before = text;
    for (const [address, target] of moves) text = text.replaceAll(address, target);
    if (text !== before) {
      writeFileSync(file, text);
      changed++;
    }
  }
  console.log(`Moved ${moves.size} asset(s) out of node_modules into assets/vendor, and pointed ${changed} file(s) at them.`);
}
