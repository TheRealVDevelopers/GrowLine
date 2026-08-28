import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { configuredSiteUrl } from "@/lib/site-url";
import { LOCALE_TAGS } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";
import ThemeScript from "@/components/ThemeScript";

/**
 * Sora, for everything (the "Voltage" direction, chosen 2026-08-28).
 *
 * The v2 spec paired a serif display (Fraunces) with Inter, on the reasoning that
 * serif-over-sans is "the cheapest single move that separates the app from every
 * template". Shown five directions side by side, the owner picked the one where a
 * single technical sans does both jobs — and one family is also one download
 * rather than two, which matters more than the pairing did on a 3G connection.
 *
 * Both CSS variable names are kept and pointed at Sora so no component has to
 * change: `--font-fraunces` is still what `font-display` resolves to, it simply
 * now carries weight 700 of the same family. Renaming the variables would touch
 * every heading in the app for no visual difference.
 */
const sora = Sora({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
      className={`${sora.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
