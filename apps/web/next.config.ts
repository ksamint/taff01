import path from "node:path";
import type { NextConfig } from "next";

// Changes with every build so installed service workers and cached locale
// files refresh after a deploy.
const assetVersion = process.env.ASSET_VERSION || Date.now().toString(36);

const config: NextConfig = {
  agentRules: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  env: { NEXT_PUBLIC_ASSET_VERSION: assetVersion },
  transpilePackages: ["@taff/schemas"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    if (!api) throw new Error("API_INTERNAL_URL is required");
    new URL(api);
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/mcp", destination: `${api}/mcp` },
    ];
  },
};
export default config;
