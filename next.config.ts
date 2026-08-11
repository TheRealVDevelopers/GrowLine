import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Pin the workspace root: a stray package-lock.json in the parent folder
  // otherwise makes Turbopack guess C:\Users\pc.
  turbopack: { root: path.resolve(__dirname) },
  // The report fonts are read from disk at render time (report-fonts.ts), so the
  // tracer cannot see them — there is no `import` to follow, only a `readFile` of a
  // path built at runtime. Without this the three image routes deploy without their
  // fonts and fall straight back to fetching Google, which is the thing D66 exists
  // to stop. `assets/fonts` is server-only on purpose and is NOT under `public/`.
  outputFileTracingIncludes: {
    "/r/[token]/card.png": ["./assets/fonts/**"],
    "/r/[token]/preview.png": ["./assets/fonts/**"],
    "/r/[token]/snapshot.pdf": ["./assets/fonts/**"],
  },
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
