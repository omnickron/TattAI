import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Optimistic check only: unauthenticated visitors are sent to /login.
 * Authorisation (active account, role, data scope) is enforced server-side.
 */
export const proxy = auth((request) => {
  if (!request.auth) {
    const url = new URL("/login", request.nextUrl);
    if (request.nextUrl.pathname !== "/")
      url.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    "/((?!login|api/auth|api/webhooks|_next/static|_next/image|icon.png|apple-icon.png|manifest.webmanifest|icons/).*)",
  ],
};
