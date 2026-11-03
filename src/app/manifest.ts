import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TattAI – Leads & Beratungen",
    short_name: "TattAI",
    description: "Leads und Beratungstermine für das Tattoo-Studio",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#1c1b19",
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
