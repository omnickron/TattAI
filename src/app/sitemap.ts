import type { MetadataRoute } from "next";
import { LEGAL_PATHS } from "@/lib/site/routing";
import { siteOrigin } from "@/lib/site/links";

export const dynamic = "force-dynamic"; // SITE_DOMAIN is read at runtime

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  if (!origin) return [];
  return [
    { url: `${origin}/`, priority: 1 },
    ...LEGAL_PATHS.map((path) => ({ url: `${origin}${path}`, priority: 0.3 })),
  ];
}
