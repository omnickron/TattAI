"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { normalizeShares } from "@/lib/scheduling/fairness";

export async function updateFairness(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const windowDays = Number(formData.get("windowDays"));
  if (!Number.isInteger(windowDays) || windowDays < 7 || windowDays > 365) {
    return { ok: false, message: "Zeitraum muss zwischen 7 und 365 Tagen liegen." };
  }

  const profiles = await prisma.tattooerProfile.findMany({
    where: { user: { active: true } },
    select: { id: true },
  });
  const raw = profiles.map((p) => {
    const value = Number(String(formData.get(`share_${p.id}`) ?? "").replace(",", "."));
    return Number.isFinite(value) && value >= 0 ? value : NaN;
  });
  if (raw.some(Number.isNaN)) return { ok: false, message: "Anteile müssen Zahlen ≥ 0 sein." };
  if (raw.every((v) => v === 0))
    return { ok: false, message: "Mindestens ein Anteil muss größer als 0 sein." };

  // Store normalised percentages so the saved values always sum to 100.
  const shares = normalizeShares(raw);
  await prisma.$transaction([
    ...profiles.map((p, i) =>
      prisma.fairnessShare.upsert({
        where: { tattooerId: p.id },
        update: { weight: Math.round(shares[i] * 1000) / 10 },
        create: { tattooerId: p.id, weight: Math.round(shares[i] * 1000) / 10 },
      }),
    ),
    prisma.fairnessConfig.upsert({
      where: { id: 1 },
      update: { windowDays },
      create: { id: 1, windowDays },
    }),
  ]);
  revalidatePath("/admin/fairness");
  return { ok: true, message: "Gespeichert. Anteile wurden auf 100 % normiert." };
}
