import localFont from "next/font/local";

/** Font of the "NEEDL" wordmark (swap src/app/fonts/logo.woff2 to change it). */
export const logoFont = localFont({
  src: "./fonts/logo.woff2",
  weight: "500",
  display: "swap",
  // Also used for all headings (see globals.css)
  variable: "--font-logo",
  fallback: ["Eurostile", "Eurostyle", "system-ui", "sans-serif"],
});

/**
 * Public website only (see src/app/(site)/layout.tsx):
 * - display: Saira, expanded width (wdth 125), weights 500–700 – headlines in the Eurostile-
 *   Extended style of the brand. Instanced from the variable font (SIL OFL 1.1).
 * - body: Red Hat Display, variable weights 300–900, latin subset (SIL OFL 1.1).
 */
export const siteDisplayFont = localFont({
  src: "./fonts/display.woff2",
  weight: "500 700",
  display: "swap",
  variable: "--font-display",
  fallback: ["Eurostile Extended", "system-ui", "sans-serif"],
});

export const siteBodyFont = localFont({
  src: "./fonts/body.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-body",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});
