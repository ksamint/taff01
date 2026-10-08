import type { NextConfig } from "next";

const config: NextConfig = {
  agentRules: false,
  transpilePackages: ["@taff/schemas"],
  images: { unoptimized: true },
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    if (!api) throw new Error("API_INTERNAL_URL is required");
    new URL(api);
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};
export default config;
