"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { APP_TIMEZONE } from "@/lib/format";
import { schedulingDeps } from "@/lib/scheduling/deps";
import { retrySessionSync, syncConsultationSessions } from "@/lib/scheduling/session-calendar";
import {
  addSession,
  OutcomeError,
  recordOutcome,
  setSessionCancelled,
  updateSession,
  type OutcomeInput,
} from "@/lib/outcomes/outcome";

/** Admin or the tattooer of the consultation. */
async function requireConsultationAccess(consultationId: string) {
  const user = await requireUser();
  const c = await prisma.consultation.findUnique({
    where: { id: consultationId },
    select: { id: true, leadId: true, tattooerId: true },
  });
  if (!c || (user.role !== "ADMIN" && c.tattooerId !== user.tattooerProfile?.id)) return null;
  return { user, consultation: c };
}

function revalidate(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/consultations");
  revalidatePath("/admin/dashboard");
}

function fail(err: unknown): ActionState {
  if (err instanceof OutcomeError) return { ok: false, message: err.message };
  console.error("[outcome]", err);
  return { ok: false, message: "Unerwarteter Fehler beim Speichern." };
}

export async function recordOutcomeAction(
  consultationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await requireConsultationAccess(consultationId);
  if (!access) return { ok: false, message: "Kein Zugriff auf diesen Termin." };

  const sessions: NonNullable<OutcomeInput["sessions"]> = [];
  for (let i = 0; i < 30; i++) {
    const date = formData.get(`session_date_${i}`);
    if (date === null) continue;
    sessions.push({
      date: String(date),
      amount: String(formData.get(`session_amount_${i}`) ?? ""),
      start: String(formData.get(`session_start_${i}`) ?? ""),
      end: String(formData.get(`session_end_${i}`) ?? ""),
    });
  }
  const further = formData.get("furtherScheduled");
  const input: OutcomeInput = {
    outcome: String(formData.get("outcome") ?? "") as OutcomeInput["outcome"],
    tattoo: (formData.get("tattoo") as OutcomeInput["tattoo"]) ?? undefined,
    sessionPlan: (formData.get("sessionPlan") as OutcomeInput["sessionPlan"]) ?? undefined,
    furtherScheduled: further === null ? undefined : further === "yes",
    sessions,
    note: String(formData.get("note") ?? ""),
  };
  try {
    await recordOutcome(prisma, {
      consultationId,
      userId: access.user.id,
      outcome: input,
      timeZone: APP_TIMEZONE,
    });
  } catch (err) {
    return fail(err);
  }
  // Calendar sync is best effort; failures stay pending and are retried by the worker.
  await syncConsultationSessions(schedulingDeps(), access.consultation.id);
  revalidate(access.consultation.leadId);
  // The form disappears after saving (entry leaves the "open" list), so confirm via the URL.
  const returnTo = String(formData.get("returnTo") ?? "");
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    const url = new URL(returnTo, "http://local");
    url.searchParams.set("saved", consultationId);
    redirect(url.pathname + url.search);
  }
  return { ok: true, message: "Ergebnis gespeichert." };
}

export async function addSessionAction(
  consultationId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await requireConsultationAccess(consultationId);
  if (!access) return { ok: false, message: "Kein Zugriff auf diesen Termin." };
  try {
    await addSession(prisma, {
      consultationId,
      date: String(formData.get("date") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      start: String(formData.get("start") ?? ""),
      end: String(formData.get("end") ?? ""),
      timeZone: APP_TIMEZONE,
    });
  } catch (err) {
    return fail(err);
  }
  // Calendar sync is best effort; failures stay pending and are retried by the worker.
  await syncConsultationSessions(schedulingDeps(), access.consultation.id);
  revalidate(access.consultation.leadId);
  return { ok: true, message: "Termin hinzugefügt." };
}

async function sessionAccess(sessionId: string) {
  const s = await prisma.tattooBooking.findUnique({
    where: { id: sessionId },
    select: { consultationId: true },
  });
  return s ? requireConsultationAccess(s.consultationId) : null;
}

export async function updateSessionAction(
  sessionId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, message: "Kein Zugriff." };
  try {
    await updateSession(prisma, {
      sessionId,
      date: String(formData.get("date") ?? ""),
      amount: String(formData.get("amount") ?? ""),
      start: String(formData.get("start") ?? ""),
      end: String(formData.get("end") ?? ""),
      timeZone: APP_TIMEZONE,
    });
  } catch (err) {
    return fail(err);
  }
  // Calendar sync is best effort; failures stay pending and are retried by the worker.
  await syncConsultationSessions(schedulingDeps(), access.consultation.id);
  revalidate(access.consultation.leadId);
  return { ok: true, message: "Gespeichert." };
}

export async function setSessionCancelledAction(
  sessionId: string,
  cancelled: boolean,
): Promise<ActionState> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, message: "Kein Zugriff." };
  await setSessionCancelled(prisma, sessionId, cancelled);
  // Calendar sync is best effort; failures stay pending and are retried by the worker.
  await syncConsultationSessions(schedulingDeps(), access.consultation.id);
  revalidate(access.consultation.leadId);
  return { ok: true, message: cancelled ? "Termin abgesagt." : "Termin wiederhergestellt." };
}

/** Manually retries the Google Calendar sync of one tattoo session. */
export async function retrySessionSyncAction(sessionId: string): Promise<ActionState> {
  const access = await sessionAccess(sessionId);
  if (!access) return { ok: false, message: "Kein Zugriff." };
  const result = await retrySessionSync(schedulingDeps(), sessionId);
  // On success the client shows the confirmation first and refreshes itself shortly after.
  if (!result.ok) revalidate(access.consultation.leadId);
  return result;
}
