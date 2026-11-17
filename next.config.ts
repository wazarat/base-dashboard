import type { NextConfig } from "next";

/**
 * Served by Next on Vercel (no static export since the login wall, 2026-11-09). Pages still
 * prerender as static HTML; src/proxy.ts runs Clerk in front of them.
 */
const nextConfig: NextConfig = {
  trailingSlash: true,
  // Clerk's production keys only work on canhav.com, so the old Vercel URL sends readers to the real site.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "robinhoodchain-dashboard.vercel.app" }],
        destination: "https://robinhood.canhav.com/:path*",
        permanent: true,
      },
    ];
  },
  images: { unoptimized: true },
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
