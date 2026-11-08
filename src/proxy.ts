import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { decideRoute } from "./lib/site/routing";

const { auth } = NextAuth(authConfig);

/**
 * 1. Host switch: the website domain (SITE_DOMAIN and www) shows the public website,
 *    every other host the app (see src/lib/site/routing.ts).
 * 2. Optimistic check only: unauthenticated visitors of app routes are sent to /login.
 *    Authorisation (active account, role, data scope) is enforced server-side.
 */
export const proxy = auth((request) => {
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
      return;
    case "rewrite":
      return NextResponse.rewrite(new URL(decision.path, request.nextUrl));
    case "redirect":
      return NextResponse.redirect(
        decision.url.startsWith("/") ? new URL(decision.url, siteOrigin(request)) : decision.url,
        decision.permanent ? 308 : 307,
      );
    case "not-found":
      return new NextResponse("Not Found", { status: 404 });
    case "auth":
      if (!request.auth) {
        const url = new URL("/login", request.nextUrl);
        if (request.nextUrl.pathname !== "/")
          url.searchParams.set("callbackUrl", request.nextUrl.pathname);
        return NextResponse.redirect(url);
      }
  }
});

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
