import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { configuredSiteUrl } from "@/lib/site-url";
import { LOCALE_TAGS } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import ThemeScript from "@/components/ThemeScript";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Serif display for headings and big numbers (v2 §4). Only the weights actually
// used — a display face is a real download on a 3G connection.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Growline",
  description: "The daily operating system for wellness coaches.",
  applicationName: "Growline",
  // Relative og:image URLs need an absolute base or they resolve to localhost off
  // Vercel, leaving forwarded snapshot links with no preview card.
  metadataBase: new URL(configuredSiteUrl() ?? "https://growline.in"),

  /**
   * iOS does not read the web app manifest. Everything Android takes from
   * `app/manifest.ts` — the standalone window, the name, the home-screen icon — Safari
   * takes from these tags instead, so leaving them out would make the app installable
   * on Android only. The target device is a mid-range Android (v1 §3), so this is the
   * minor platform; it is here because a coach's upline showing the app on an iPhone is
   * exactly the moment it must not look unfinished.
   */
  appleWebApp: {
    capable: true,
    title: "Growline",
    // The app paints its own near-black ground, so the status bar should sit on top of
    // it rather than in a separate strip.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Matches the dark surface so the Android status bar does not sit in a
  // contrasting strip above a dark app.
  themeColor: "#0B1020",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // `lang` is not decoration: screen readers pick a voice from it, and the browser
  // picks line-breaking and font fallback from it — which matters most for exactly the
  // scripts we just added.
  const locale = await getLocale();

  return (
    <html
      lang={LOCALE_TAGS[locale]}
      // Set by ThemeScript before paint; this is only the pre-hydration default.
      data-theme="dark"
      className={`${inter.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
