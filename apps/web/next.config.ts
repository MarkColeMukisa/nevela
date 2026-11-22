import path from "node:path";
import type { NextConfig } from "next";

// The project folder, two up: packages/shared (the brand, the themes and the layout this
// dashboard shares with the phone app) is there, beside apps/. Next only reads files inside
// its root, and finds that root by the nearest lockfile, which is this app's own: without
// these two lines, importing from it fails with "Can't resolve".
const project = path.join(__dirname, "..", "..");

const config: NextConfig = {
  // Compile @flaredev/core from source rather than resolving it as an opaque package.
  transpilePackages: ["@flaredev/core"],
  turbopack: { root: project },
  outputFileTracingRoot: project,
};

export default config;
