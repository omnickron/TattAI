import type { NextAuthConfig } from "next-auth";

/**
 * Database-free part of the Auth.js config. Used by the proxy, which only
 * needs to decode the session cookie. Real authorisation (active user, role)
 * happens in the data access layer on every request (src/lib/auth/session.ts).
 */
export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
} satisfies NextAuthConfig;
