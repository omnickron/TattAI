import localFont from "next/font/local";

/** Font of the "NEEDL" wordmark (swap src/app/fonts/logo.woff2 to change it). */
export const logoFont = localFont({
  src: "./fonts/logo.woff2",
  weight: "500",
  display: "swap",
  fallback: ["Eurostile", "Eurostyle", "system-ui", "sans-serif"],
});
