import type { NextConfig } from "next";

const config: NextConfig = {
  // Compile @flaredev/core from source rather than resolving it as an opaque package.
  transpilePackages: ["@flaredev/core"],
};

export default config;
