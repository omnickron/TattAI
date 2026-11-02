import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      tattooerProfile: { select: { id: true } },
    },
  });
}

/** The signed-in, active user, or null. Checked against the DB on every request. */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await loadUser(id);
  return user?.active ? user : null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/leads");
  return user;
}

/** Restricts lead queries: tattooers only see leads with a consultation of theirs. */
export function leadScope(user: CurrentUser): Prisma.LeadWhereInput {
  if (user.role === "ADMIN") return {};
  const tattooerId = user.tattooerProfile?.id;
  if (!tattooerId) return { id: "__none__" };
  return { consultations: { some: { tattooerId } } };
}
