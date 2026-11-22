import type { NextConfig } from "next";

const api = (process.env.DISPATCH_API_ORIGIN ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const exporting = process.env.DISPATCH_STATIC_EXPORT === "1";

const config: NextConfig = {
  devIndicators: false,
  agentRules: false,
  ...(exporting ? { output: "export", trailingSlash: true } : { async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/catalogue/:image.webp", destination: `${api}/catalogue/:image.webp` },
    ];
  } }),
};

export default config;
