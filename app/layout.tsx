import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Figtree } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const display = Barlow_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Figtree({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Paddle Stack - Open Play Rotations",
  description:
    "Fair pickleball paddle stacking for large open play. Run courts from your phone.",
  appleWebApp: {
    capable: true,
    title: "Paddle Stack",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2e1c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", display.variable, body.variable)}
    >
      <body className="flex min-h-dvh flex-col overscroll-none">{children}</body>
    </html>
  );
}
