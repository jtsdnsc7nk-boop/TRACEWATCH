import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Pages may show lookup results, so neither the browser nor any proxy may keep a copy of them.
const noStoreHeaders = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" }];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The Docker image ships the slim standalone server; local installs use the regular `next start`.
  output: process.env.TRACEWATCH_STANDALONE === "1" ? "standalone" : undefined,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: noStoreHeaders },
      { source: "/dashboard", headers: noStoreHeaders },
    ];
  },
};

export default nextConfig;
