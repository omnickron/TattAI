"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { leadScope, requireAdmin, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LEAD_STATUS_ORDER } from "@/lib/labels";
import { normalizePhone } from "@/lib/phone";
import {
  BookingError,
  bookConsultation,
  cancelConsultation,
  reassignConsultation,
  updateConsultationMode,
} from "@/lib/scheduling/booking";
import { schedulingDeps } from "@/lib/scheduling/deps";
import { defaultPhoneCountry } from "@/lib/settings";
import { cancelQueued } from "@/lib/whatsapp/messaging";

const leadSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(200),
  phone: z.string().trim().max(50),
  email: z.union([z.literal(""), z.email("E-Mail-Adresse ist ungültig.").trim().max(200)]),
  status: z.enum(LEAD_STATUS_ORDER as [string, ...string[]]),
});

export async function updateLead(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const parsed = leadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { name, phone, email, status } = parsed.data;
  const whatsappOptOut = formData.get("whatsappOptOut") === "on";
  const current = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!current) return { ok: false, message: "Lead nicht gefunden." };

  const normalized = normalizePhone(phone, defaultPhoneCountry());
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      name,
      phoneRaw: normalized.raw || null,
      phoneE164: normalized.e164,
      phoneValid: normalized.valid,
      email: email ? email.toLowerCase() : null,
      whatsappOptOut,
      status: status as (typeof LEAD_STATUS_ORDER)[number],
      ...(current.status !== status ? { statusChangedAt: new Date() } : {}),
    },
  });
  if (whatsappOptOut)
    await cancelQueued(prisma, leadId, ["FIRST_CONTACT", "FOLLOW_UP", "REMINDER"]);
  revalidatePath(`/leads/${leadId}`);
  return {
    ok: true,
    message:
      normalized.valid || !phone
        ? "Gespeichert."
        : "Gespeichert. Hinweis: Telefonnummer ist ungültig.",
  };
}

const noteSchema = z.object({ body: z.string().trim().min(1, "Notiz ist leer.").max(5000) });

export async function addLeadNote(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const lead = await prisma.lead.findFirst({
    where: { AND: [leadScope(user), { id: leadId }] },
    select: { id: true },
  });
  if (!lead) return { ok: false, message: "Kein Zugriff auf diesen Lead." };

  await prisma.leadNote.create({ data: { leadId, authorId: user.id, body: parsed.data.body } });
  revalidatePath(`/leads/${leadId}`);
  return { ok: true, message: "Notiz gespeichert." };
}

/** Permanently deletes a lead incl. notes, messages and consultations (GDPR). */
export async function deleteLead(leadId: string): Promise<ActionState> {
  await requireAdmin();
  await prisma.lead.delete({ where: { id: leadId } }).catch(() => null);
  revalidatePath("/leads");
  redirect("/leads");
}

// ---------------------------------------------------------------------------
// Consultations
// ---------------------------------------------------------------------------

function bookingMessage(err: unknown): ActionState {
  if (err instanceof BookingError) return { ok: false, message: err.message };
  console.error("[booking]", err);
  return { ok: false, message: "Unerwarteter Fehler beim Buchen." };
}

const bookSchema = z.object({
  slot: z.string().min(1, "Bitte einen Termin auswählen."),
  mode: z.enum(["ON_SITE", "PHONE"]),
  tattooerId: z.string().optional().default(""),
});

export async function bookConsultationAction(
  leadId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = bookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const startsAt = new Date(parsed.data.slot);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Ungültiger Termin." };

  let booked: Awaited<ReturnType<typeof bookConsultation>>;
  try {
    booked = await bookConsultation(schedulingDeps(), {
      leadId,
      startsAt,
      mode: parsed.data.mode,
      tattooerId: parsed.data.tattooerId || undefined,
      createdById: user.id,
    });
  } catch (err) {
    return bookingMessage(err);
  }
  // The booking form disappears after booking, so the confirmation is shown via the URL.
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}?booked=${booked.id}`);
}

/** Admin or the assigned tattooer may manage a consultation. */
async function requireConsultationAccess(consultationId: string) {
  const user = await requireUser();
  const c = await prisma.consultation.findUnique({ where: { id: consultationId } });
  if (!c) return null;
  if (user.role !== "ADMIN" && c.tattooerId !== user.tattooerProfile?.id) return null;
  return { user, consultation: c };
}

export async function cancelConsultationAction(consultationId: string): Promise<ActionState> {
  const access = await requireConsultationAccess(consultationId);
  if (!access) return { ok: false, message: "Kein Zugriff auf diesen Termin." };
  try {
    const { calendarEventRemoved } = await cancelConsultation(schedulingDeps(), consultationId);
    revalidatePath(`/leads/${access.consultation.leadId}`);
    return {
      ok: true,
      message: calendarEventRemoved
        ? "Termin abgesagt."
        : "Termin abgesagt. Der Kalendereintrag konnte nicht gelöscht werden – bitte manuell entfernen.",
    };
  } catch (err) {
    return bookingMessage(err);
  }
}

export async function reassignConsultationAction(
  consultationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const tattooerId = String(formData.get("tattooerId") ?? "");
  if (!tattooerId) return { ok: false, message: "Bitte eine Person auswählen." };
  try {
    const c = await reassignConsultation(schedulingDeps(), consultationId, tattooerId);
    revalidatePath(`/leads/${c.leadId}`);
    return { ok: true, message: "Termin umverteilt." };
  } catch (err) {
    return bookingMessage(err);
  }
}

export async function changeConsultationModeAction(
  consultationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await requireConsultationAccess(consultationId);
  if (!access) return { ok: false, message: "Kein Zugriff auf diesen Termin." };
  const mode = formData.get("mode");
  if (mode !== "ON_SITE" && mode !== "PHONE")
    return { ok: false, message: "Ungültige Beratungsform." };
  const { calendarUpdated } = await updateConsultationMode(schedulingDeps(), consultationId, mode);
  revalidatePath(`/leads/${access.consultation.leadId}`);
  return {
    ok: true,
    message: calendarUpdated
      ? "Beratungsform geändert."
      : "Geändert, aber der Kalendereintrag konnte nicht aktualisiert werden.",
  };
}
