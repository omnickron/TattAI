import type { NextConfig } from "next";

// Cache Components are intentionally disabled: this is an internal app where
// nearly every page depends on the signed-in user and live database data.
const nextConfig: NextConfig = {
  output: "standalone",
  // Never copy private customer files (reference images) or local env files into the build output.
  outputFileTracingExcludes: { "*": ["./storage/**", "./.env*"] },
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
