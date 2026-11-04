"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { type CurrentUser, leadScope, requireTattooer, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/labels";
import { parseEuroToCents } from "@/lib/outcomes/money";
import { addSession, OutcomeError } from "@/lib/outcomes/outcome";
import { normalizePhone } from "@/lib/phone";
import {
  BookingError,
  checkSessionSlot,
  createBlocker,
  createWalkInProject,
  createManualConsultation,
} from "@/lib/scheduling/booking";
import { schedulingDeps } from "@/lib/scheduling/deps";
import { syncConsultationSessions } from "@/lib/scheduling/session-calendar";
import { defaultPhoneCountry } from "@/lib/settings";
import { isLocalDate, isQuarterHour, parseTimeOfDay, zonedTimeToUtc } from "@/lib/time";

export type LeadOption = {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  /** Booked tattoos of this lead (only for type "tattoo") */
  projects: Array<{ consultationId: string; label: string }>;
};

/** Contact search for the "new appointment" dialog (tattooers only find their own leads). */
export async function searchLeadsAction(
  query: string,
  type: "consultation" | "tattoo",
  tattooerId: string | null,
): Promise<LeadOption[]> {
  const user = await requireUser();
  const q = query.trim();
  const digits = q.replace(/\D/g, "").replace(/^0+/, "");
  const leads = await prisma.lead.findMany({
    where: {
      AND: [
        leadScope(user),
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                ...(digits.length >= 3 ? [{ phoneE164: { contains: digits } }] : []),
              ],
            }
          : {},
        type === "tattoo"
          ? {
              consultations: {
                some: { status: "HELD", tattooBooked: true, ...(tattooerId ? { tattooerId } : {}) },
              },
            }
          : {},
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      phoneE164: true,
      status: true,
      consultations: {
        // Only booked tattoos are relevant for type "tattoo"
        where:
          type === "tattoo"
            ? { status: "HELD", tattooBooked: true, ...(tattooerId ? { tattooerId } : {}) }
            : { id: "__none__" },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          startsAt: true,
          tattooer: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });
  const day = new Intl.DateTimeFormat("de-DE", { timeZone: APP_TIMEZONE, dateStyle: "medium" });
  return leads.map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phoneE164,
    status: LEAD_STATUS_LABELS[l.status],
    projects: l.consultations.map((c) => ({
      consultationId: c.id,
      label: `Tattoo bei ${c.tattooer.user.name} (Beratung ${day.format(c.startsAt)})`,
    })),
  }));
}

function parseSlot(formData: FormData, needEnd: boolean) {
  const date = String(formData.get("date") ?? "");
  const start = parseTimeOfDay(String(formData.get("start") ?? ""));
  const end = parseTimeOfDay(String(formData.get("end") ?? ""));
  if (!isLocalDate(date) || start === null || !isQuarterHour(start) || start >= 1440) return null;
  if (needEnd && (end === null || !isQuarterHour(end) || end <= start)) return null;
  return {
    date,
    startTime: String(formData.get("start")),
    endTime: needEnd ? String(formData.get("end")) : null,
    startsAt: zonedTimeToUtc(date, start, APP_TIMEZONE),
    endsAt:
      needEnd && end !== null
        ? end >= 1440
          ? zonedTimeToUtc(date, 1439, APP_TIMEZONE)
          : zonedTimeToUtc(date, end, APP_TIMEZONE)
        : null,
  };
}

function fail(err: unknown): ActionState {
  if (err instanceof BookingError || err instanceof OutcomeError)
    return { ok: false, message: err.message };
  console.error("[calendar] create entry failed:", err);
  return { ok: false, message: "Unerwarteter Fehler beim Speichern." };
}

/** Creates a consultation, tattoo session or blocker from the calendar. */
export async function createCalendarEntryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTattooer().catch(() => null);
  const anyUser = user ?? (await requireUser());
  const isAdmin = anyUser.role === "ADMIN";
  const type = String(formData.get("type") ?? "");
  // Tattooers always enter for themselves; the admin chooses.
  const tattooerId = isAdmin
    ? String(formData.get("tattooerId") ?? "")
    : (user?.tattooerProfile.id ?? "");
  const walkIn = type === "tattoo" && formData.get("walkIn") === "1";
  // For tattoo sessions the person follows from the booked tattoo (except walk-ins).
  if (!tattooerId && (type !== "tattoo" || walkIn))
    return { ok: false, message: "Bitte auswählen, für wen der Termin ist." };
  const deps = schedulingDeps();

  try {
    if (type === "blocker") {
      const slot = parseSlot(formData, true);
      if (!slot)
        return { ok: false, message: "Bitte Datum, Beginn und Ende (Viertelstunden) wählen." };
      await createBlocker(deps, {
        tattooerId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt!,
        note: String(formData.get("note") ?? ""),
      });
      revalidatePath("/calendar");
      return { ok: true, message: "Blocker eingetragen." };
    }

    if (type === "consultation") {
      const slot = parseSlot(formData, false);
      if (!slot) return { ok: false, message: "Bitte Datum und Beginn (Viertelstunden) wählen." };
      const resolved = await resolveLead(formData, anyUser);
      if ("message" in resolved) return { ok: false, message: resolved.message };
      const { leadId, created: createdLead } = resolved;
      const mode = formData.get("mode") === "PHONE" ? "PHONE" : "ON_SITE";
      try {
        await createManualConsultation(deps, {
          leadId,
          tattooerId,
          startsAt: slot.startsAt,
          mode,
          createdById: anyUser.id,
        });
      } catch (err) {
        // Don't leave an orphaned contact behind when the slot was rejected.
        if (createdLead) await prisma.lead.delete({ where: { id: leadId } }).catch(() => {});
        throw err;
      }
      revalidatePath("/calendar");
      revalidatePath(`/leads/${leadId}`);
      return { ok: true, message: "Beratung eingetragen." };
    }

    if (type === "tattoo") {
      const slot = parseSlot(formData, true);
      if (!slot)
        return { ok: false, message: "Bitte Datum, Beginn und Ende (Viertelstunden) wählen." };
      if (walkIn) {
        if (parseEuroToCents(String(formData.get("amount") ?? "")) === "invalid")
          return { ok: false, message: "Betrag ist ungültig (z. B. 450 oder 1.250,50)." };
        const resolved = await resolveLead(formData, anyUser);
        if ("message" in resolved) return { ok: false, message: resolved.message };
        let projectId: string | null = null;
        try {
          projectId = await createWalkInProject(deps, {
            leadId: resolved.leadId,
            tattooerId,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt!,
            createdById: anyUser.id,
          });
          await addSession(prisma, {
            consultationId: projectId,
            date: slot.date,
            start: slot.startTime,
            end: slot.endTime ?? undefined,
            amount: String(formData.get("amount") ?? ""),
            timeZone: APP_TIMEZONE,
          });
        } catch (err) {
          // Roll back: no empty project, no orphaned contact
          if (projectId)
            await prisma.consultation.delete({ where: { id: projectId } }).catch(() => {});
          if (resolved.created)
            await prisma.lead.delete({ where: { id: resolved.leadId } }).catch(() => {});
          throw err;
        }
        await prisma.consultation.update({
          where: { id: projectId },
          data: { sessionPlan: "SINGLE", furtherSessionsScheduled: null },
        });
        await syncConsultationSessions(deps, projectId);
        revalidatePath("/calendar");
        revalidatePath(`/leads/${resolved.leadId}`);
        return { ok: true, message: "Tattoo-Termin für Laufkunde eingetragen." };
      }
      const consultationId = String(formData.get("consultationId") ?? "");
      const c = await prisma.consultation.findUnique({
        where: { id: consultationId },
        select: { tattooerId: true, leadId: true },
      });
      if (!c) return { ok: false, message: "Bitte einen Kontakt mit gebuchtem Tattoo auswählen." };
      if (!isAdmin && c.tattooerId !== tattooerId)
        return { ok: false, message: "Dieses Tattoo gehört zu einer anderen Person." };
      await checkSessionSlot(deps, consultationId, slot.startsAt, slot.endsAt!);
      await addSession(prisma, {
        consultationId,
        date: slot.date,
        start: slot.startTime,
        end: slot.endTime ?? undefined,
        amount: String(formData.get("amount") ?? ""),
        timeZone: APP_TIMEZONE,
      });
      await syncConsultationSessions(deps, consultationId);
      revalidatePath("/calendar");
      revalidatePath(`/leads/${c.leadId}`);
      return { ok: true, message: "Tattoo-Termin eingetragen." };
    }
  } catch (err) {
    return fail(err);
  }
  return { ok: false, message: "Bitte eine Art auswählen." };
}

/** Selected contact (in the user's scope) or a newly created one from name/phone. */
async function resolveLead(
  formData: FormData,
  user: CurrentUser,
): Promise<{ leadId: string; created: boolean } | { message: string }> {
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) {
    const name = String(formData.get("newName") ?? "").trim();
    const phoneRaw = String(formData.get("newPhone") ?? "").trim();
    if (!name) return { message: "Bitte einen Kontakt auswählen oder einen neuen anlegen." };
    const phone = normalizePhone(phoneRaw, defaultPhoneCountry());
    if (phoneRaw && !phone.valid) return { message: "Die Telefonnummer ist ungültig." };
    const id = (
      await prisma.lead.create({
        data: {
          source: "MANUAL",
          name: name.slice(0, 200),
          phoneRaw: phoneRaw || null,
          phoneE164: phone.e164,
          phoneValid: phone.valid,
        },
      })
    ).id;
    return { leadId: id, created: true };
  } else if (
    !(await prisma.lead.findFirst({
      where: { AND: [leadScope(user), { id: leadId }] },
      select: { id: true },
    }))
  ) {
    return { message: "Kein Zugriff auf diesen Kontakt." };
  }
  return { leadId, created: false };
}

/** Removes a blocker (admin or the owner). */
export async function deleteBlockerAction(id: string): Promise<ActionState> {
  const user = await requireUser();
  const block = await prisma.availabilityException.findUnique({ where: { id } });
  if (!block) return { ok: false, message: "Blocker nicht gefunden." };
  if (user.role !== "ADMIN" && block.tattooerId !== user.tattooerProfile?.id) {
    return { ok: false, message: "Kein Zugriff." };
  }
  await prisma.availabilityException.delete({ where: { id } });
  revalidatePath("/calendar");
  revalidatePath("/availability");
  return { ok: true, message: "Blocker gelöscht." };
}
