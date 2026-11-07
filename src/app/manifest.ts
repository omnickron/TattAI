import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NEEDL – Leads & Beratungen",
    short_name: "NEEDL",
    description: "Leads und Beratungstermine für das Tattoo-Studio",
    start_url: "/",
    display: "standalone",
    // Native splash on Android (icon on this colour) – matches the in-app splash screen
    background_color: "#18181b",
    theme_color: "#18181b",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
