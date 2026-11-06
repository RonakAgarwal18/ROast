import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // NOTE: cacheComponents (and partialPrefetching, which depends on it) are
  // intentionally OFF in v1 — every app page reads live DB state and is
  // marked `dynamic = "force-dynamic"` instead.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
