import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root: a stray package-lock.json in the parent folder
  // otherwise makes Turbopack guess C:\Users\pc.
  turbopack: { root: path.resolve(__dirname) },
  async headers() {
    return [
      {
        // A wellness snapshot link is a bearer credential holding someone else's
        // personal details, and it travels through WhatsApp forwards and chat
        // backups. Keep it out of indexes, caches and referrer headers.
        source: "/r/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
      {
        // The public capture form collects personal details; same reasoning.
        source: "/c/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
