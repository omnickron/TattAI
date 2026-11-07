import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SplashScreen } from "@/components/splash-screen";
import { logoFont } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEEDL", template: "%s · NEEDL" },
  description: "Leads und Beratungstermine für das Tattoo-Studio",
  applicationName: "NEEDL",
  appleWebApp: { capable: true, title: "NEEDL", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#111214" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={`h-full antialiased ${logoFont.variable}`}>
      <body className="min-h-full font-sans">
        <SplashScreen />
        {children}
      </body>
    </html>
  );
}
