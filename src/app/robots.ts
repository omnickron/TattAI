import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isSiteHost } from "@/lib/site/routing";
import { siteOrigin } from "@/lib/site/links";

/** Website domain: crawlable. App domain (and anything else): no indexing. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  const origin = siteOrigin();
  if (origin && isSiteHost(host, { siteDomain: process.env.SITE_DOMAIN })) {
    return { rules: { userAgent: "*", allow: "/" }, sitemap: `${origin}/sitemap.xml` };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
