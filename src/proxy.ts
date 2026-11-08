import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";
import { decideRoute } from "./lib/site/routing";

const { auth } = NextAuth(authConfig);

/**
 * Optimistic check only: unauthenticated visitors of app routes are sent to /login.
 * Authorisation (active account, role, data scope) is enforced server-side.
 */
const requireSession = auth((request) => {
  if (!request.auth) {
    const url = new URL("/login", request.nextUrl);
    if (request.nextUrl.pathname !== "/")
      url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

/**
 * Host switch first: the website domain (SITE_DOMAIN and www) shows the public website,
 * every other host the app (see src/lib/site/routing.ts). Only app routes go through Auth.js.
 *
 * The switch must run on the raw request, not inside auth(): Auth.js replaces the request's
 * origin with AUTH_URL (the app domain), which turned the website's rewrite of "/" into a
 * rewrite to the app domain – and that redirected back to the website (redirect loop).
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  const decision = decideRoute(
    {
      // The Host header survives Caddy; request.url may carry the container-internal host
      host: request.headers.get("host") ?? request.nextUrl.host,
      pathname: request.nextUrl.pathname,
      search: request.nextUrl.search,
    },
    { siteDomain: process.env.SITE_DOMAIN, appDomain: process.env.APP_DOMAIN },
  );

  switch (decision.kind) {
    case "next":
      return NextResponse.next();
    case "rewrite": {
      // Same origin as the incoming request, so Next serves the route itself
      const url = request.nextUrl.clone();
      url.pathname = decision.path;
      return NextResponse.rewrite(url);
    }
    case "redirect":
      return NextResponse.redirect(
        decision.url.startsWith("/") ? new URL(decision.url, siteOrigin(request)) : decision.url,
        decision.permanent ? 308 : 307,
      );
    case "not-found":
      return new NextResponse("Not Found", { status: 404 });
    case "auth":
      // auth() only passes the second argument through to our callback, which ignores it
      return requireSession(request, event as unknown as Parameters<typeof requireSession>[1]);
  }
}

/** Public origin of the current request (for same-host redirects behind the reverse proxy). */
function siteOrigin(request: { headers: Headers; nextUrl: URL }): string {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const config = {
  // Not proxied: static assets, and routes with large or signed bodies (Next buffers request
  // bodies in the proxy, max. 10 MB) – uploads, webhooks, bot API, Auth.js. On the website
  // domain Caddy answers /api/* with 404 itself (deploy/Caddyfile).
  matcher: [
    "/((?!api/auth|api/webhooks|api/bot|api/content/upload|_next/static|_next/image|icon.png|apple-icon.png|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
