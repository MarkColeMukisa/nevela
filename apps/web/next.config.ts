import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The project folder, two up: packages/shared (the brand, the themes and the layout this
// dashboard shares with the phone app) is there, beside apps/. Next only reads files inside
// its root, and finds that root by the nearest lockfile, which is this app's own: without
// these two lines, importing from it fails with "Can't resolve".
const project = path.join(__dirname, "..", "..");

// Which of the project's web apps this is ("site", "admin", or neither: one app doing both),
// as `nevela new` recorded it in .nevela.json, which is committed. See lib/app.ts.
function whichApp(): string {
  if (process.env.NEVELA_APP) return process.env.NEVELA_APP;
  try {
    const recorded = JSON.parse(readFileSync(path.join(__dirname, ".nevela.json"), "utf8")) as { app?: unknown };
    return typeof recorded.app === "string" ? recorded.app : "";
  } catch {
    return "";
  }
}

const config: NextConfig = {
  // Compile @flaredev/core from source rather than resolving it as an opaque package.
  transpilePackages: ["@flaredev/core"],
  turbopack: { root: project },
  outputFileTracingRoot: project,
  env: { NEVELA_APP: whichApp() },
};

export default config;
