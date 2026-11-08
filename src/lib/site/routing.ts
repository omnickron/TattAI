/**
 * Host-based routing between the public website (SITE_DOMAIN, e.g. needl-booker.de and
 * www.needl-booker.de) and the app (APP_DOMAIN, e.g. app.needl-booker.de). Pure functions,
 * used by src/proxy.ts and tested in routing.test.ts.
 */

/** Legal pages: reachable without login on the website AND in the app. */
export const LEGAL_PATHS = [
  "/impressum",
  "/datenschutz",
  "/nutzungsbedingungen",
  "/datenloeschung",
] as const;

/** Internal route of the website's start page (shown at "/" on the website domain). */
export const SITE_HOME_PATH = "/start";

/** Served on every host (crawler files are host-aware themselves). */
const SHARED_PUBLIC_PATHS = [...LEGAL_PATHS, "/robots.txt", "/sitemap.xml"];

/**
 * App paths that need no session (were the matcher exclusions in proxy.ts before).
 * Prefix match, like the former negative lookahead in the matcher.
 */
const APP_PUBLIC_PREFIXES = [
  "/login",
  "/api/auth",
  "/api/webhooks",
  "/api/bot",
  "/api/content/upload",
];

export type RouteDecision =
  | { kind: "next" } // serve as is, no login needed
  | { kind: "auth" } // app route: login required
  | { kind: "rewrite"; path: string } // serve another internal route, URL stays
  | { kind: "redirect"; url: string; permanent: boolean }
  | { kind: "not-found" };

export type SiteConfig = { siteDomain?: string; appDomain?: string };

/** Lower-case host without port; "" when missing. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

function bareDomain(value: string | undefined): string {
  return normalizeHost(value?.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
}

/** True for the website domain and its www variant. Never true when SITE_DOMAIN is unset. */
export function isSiteHost(host: string, config: SiteConfig): boolean {
  const site = bareDomain(config.siteDomain);
  if (!site) return false;
  const h = normalizeHost(host);
  return h === site || h === `www.${site}`;
}

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isSharedPublicPath(pathname: string): boolean {
  return SHARED_PUBLIC_PATHS.some((p) => matchesPath(pathname, p));
}

export function decideRoute(
  input: { host: string; pathname: string; search?: string },
  config: SiteConfig,
): RouteDecision {
  const { pathname } = input;
  const search = input.search ?? "";

  if (isSiteHost(input.host, config)) {
    if (pathname === "/") return { kind: "rewrite", path: SITE_HOME_PATH };
    if (matchesPath(pathname, SITE_HOME_PATH))
      return { kind: "redirect", url: `/${search}`, permanent: true };
    if (isSharedPublicPath(pathname)) return { kind: "next" };
    // Webhooks and the bot API only live on the app domain
    if (matchesPath(pathname, "/api")) return { kind: "not-found" };
    // Everything else is part of the app: send visitors there (temporary, the app may move)
    const app = bareDomain(config.appDomain);
    if (app)
      return { kind: "redirect", url: `https://${app}${pathname}${search}`, permanent: false };
    return { kind: "not-found" };
  }

  if (matchesPath(pathname, SITE_HOME_PATH)) {
    // The start page belongs to the website; without SITE_DOMAIN (development) it is served here
    const site = bareDomain(config.siteDomain);
    return site
      ? { kind: "redirect", url: `https://${site}/`, permanent: false }
      : { kind: "next" };
  }
  if (isSharedPublicPath(pathname)) return { kind: "next" };
  if (APP_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return { kind: "next" };
  return { kind: "auth" };
}
