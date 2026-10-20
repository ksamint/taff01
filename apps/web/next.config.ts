import path from "node:path";
import type { NextConfig } from "next";

// Changes with every build so installed service workers and cached locale
// files refresh after a deploy.
const assetVersion = process.env.ASSET_VERSION || Date.now().toString(36);

const config: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  env: { NEXT_PUBLIC_ASSET_VERSION: assetVersion },
  transpilePackages: ["@taff/schemas"],
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            // Next hydration uses inline scripts; calendar/graph use inline styles.
            // All network resources are served by this origin, including realtime.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'" +
                (process.env.NODE_ENV === "development"
                  ? " 'unsafe-eval'"
                  : ""),
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "worker-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
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
      // OAuth discovery for MCP clients (ADR 0022); Caddy sends these here.
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: `${api}/.well-known/oauth-protected-resource/:path*`,
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${api}/.well-known/oauth-protected-resource`,
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${api}/.well-known/oauth-authorization-server`,
      },
    ];
  },
};
export default config;
