import "server-only";
import { headers } from "next/headers";
import { isSiteHost } from "./routing";

const config = () => ({ siteDomain: process.env.SITE_DOMAIN, appDomain: process.env.APP_DOMAIN });

/** Public website origin, e.g. https://needl-booker.de (null when SITE_DOMAIN is unset). */
export function siteOrigin(): string | null {
  const domain = process.env.SITE_DOMAIN?.trim();
  if (!domain) return null;
  return domain.startsWith("http") ? domain.replace(/\/$/, "") : `https://${domain}`;
}

/**
 * Links that differ by host: on the website "/" is the start page; on the app domain
 * (legal pages there) "/" is the app, so the home link points to the website instead.
 */
export async function siteLinks() {
  const host = (await headers()).get("host") ?? "";
  const onSite = isSiteHost(host, config());
  const origin = siteOrigin();
  const home = onSite ? "/" : origin ? `${origin}/` : "/start";
  const appDomain = process.env.APP_DOMAIN?.trim();
  const login = onSite && appDomain ? `https://${appDomain}/login` : "/login";
  return { home, contact: home === "/start" ? "/start#kontakt" : `${home}#kontakt`, login, onSite };
}
