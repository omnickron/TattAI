import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authConfig } from "./auth.config";
import { prisma } from "./lib/db";
import { isDevLoginEnabled } from "./lib/auth/dev-login";

const workspaceDomain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase() || null;

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() || null;
}

/** Creates the configured admin account on first sign-in. */
async function ensureBootstrapAdmin(email: string) {
  const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  if (!adminEmail || email !== adminEmail) return;
  await prisma.user.upsert({
    where: { email },
    update: {},
    // The studio owner also tattoos, so the admin gets a tattooer profile too.
    create: {
      email,
      name: process.env.ADMIN_NAME || "Admin",
      role: "ADMIN",
      tattooerProfile: { create: { fairnessShare: { create: { weight: 1 } } } },
    },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Google({
      authorization: {
        params: { prompt: "select_account", ...(workspaceDomain ? { hd: workspaceDomain } : {}) },
      },
    }),
    ...(isDevLoginEnabled()
      ? [
          Credentials({
            id: "dev",
            name: "Entwickler-Login",
            credentials: { email: { label: "E-Mail" } },
            async authorize(credentials) {
              if (!isDevLoginEnabled()) return null;
              const email = normalizeEmail(String(credentials?.email ?? ""));
              if (!email) return null;
              const user = await prisma.user.findUnique({ where: { email } });
              return user?.active ? { id: user.id, email: user.email, name: user.name } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      const email = normalizeEmail(user.email);
      if (!email) return false;

      if (account?.provider === "google") {
        if (profile?.email_verified !== true) return false;
        if (workspaceDomain) {
          const hd = typeof profile.hd === "string" ? profile.hd.toLowerCase() : null;
          if (hd !== workspaceDomain || !email.endsWith(`@${workspaceDomain}`)) return false;
        }
        await ensureBootstrapAdmin(email);
      } else if (account?.provider !== "dev") {
        return false;
      }

      // Only accounts created by the admin (or the bootstrap admin) may sign in.
      const dbUser = await prisma.user.findUnique({ where: { email } });
      if (!dbUser?.active) return false;
      await prisma.user.update({ where: { id: dbUser.id }, data: { lastLoginAt: new Date() } });
      return true;
    },
    async jwt({ token, user }) {
      const email = normalizeEmail(user?.email);
      if (email) {
        const dbUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        token.uid = dbUser?.id;
      }
      return token;
    },
  },
});
