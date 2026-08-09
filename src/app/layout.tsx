import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { configuredSiteUrl } from "@/lib/site-url";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Growline",
  description: "The daily operating system for wellness coaches.",
  applicationName: "Growline",
  // Relative og:image URLs need an absolute base or they resolve to localhost off
  // Vercel, leaving forwarded snapshot links with no preview card.
  metadataBase: new URL(configuredSiteUrl() ?? "https://growline.in"),
};

export const viewport: Viewport = {
  themeColor: "#14213D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
