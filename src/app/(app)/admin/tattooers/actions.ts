"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isColor } from "@/lib/tattooer-colors";

const tattooerSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(200),
  email: z.email("E-Mail-Adresse ist ungültig.").trim().toLowerCase().max(200),
});

function workspaceDomainError(email: string): string | null {
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim().toLowerCase();
  if (domain && !email.endsWith(`@${domain}`)) {
    return `Die E-Mail muss zur Studio-Domain @${domain} gehören.`;
  }
  return null;
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createTattooer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = tattooerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const domainError = workspaceDomainError(parsed.data.email);
  if (domainError) return { ok: false, message: domainError };

  try {
    await prisma.user.create({
      data: {
        ...parsed.data,
        role: "TATTOOER",
        tattooerProfile: { create: { fairnessShare: { create: { weight: 1 } } } },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Diese E-Mail ist bereits vergeben." };
    throw err;
  }
  revalidatePath("/admin/tattooers");
  return { ok: true, message: `${parsed.data.name} wurde angelegt und kann sich jetzt anmelden.` };
}

export async function updateTattooer(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = tattooerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const domainError = workspaceDomainError(parsed.data.email);
  if (domainError) return { ok: false, message: domainError };
  // Calendar color: hex from the palette / color picker, "" = automatic
  const rawColor = String(formData.get("calendarColor") ?? "")
    .trim()
    .toLowerCase();
  if (rawColor && !isColor(rawColor)) return { ok: false, message: "Farbe ist ungültig." };

  try {
    await prisma.user.update({
      where: { id: userId, role: "TATTOOER" },
      data: {
        ...parsed.data,
        ...(formData.has("calendarColor")
          ? {
              tattooerProfile: {
                upsert: {
                  create: {
                    calendarColor: rawColor || null,
                    fairnessShare: { create: { weight: 1 } },
                  },
                  update: { calendarColor: rawColor || null },
                },
              },
            }
          : {}),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, message: "Diese E-Mail ist bereits vergeben." };
    throw err;
  }
  revalidatePath("/admin/tattooers");
  revalidatePath("/calendar");
  return { ok: true, message: "Gespeichert." };
}

export async function setTattooerActive(userId: string, active: boolean): Promise<ActionState> {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId, role: "TATTOOER" }, data: { active } });
  revalidatePath("/admin/tattooers");
  return {
    ok: true,
    message: active ? "Wieder aktiviert." : "Deaktiviert. Anmeldung ist gesperrt.",
  };
}
