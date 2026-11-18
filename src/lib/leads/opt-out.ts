import type { LeadStatus } from "@/generated/prisma/enums";

/**
 * Statuses an opt-out turns into "Gestoppt" (OPTED_OUT). Later phases (consultation booked
 * or held, tattoo, …) keep their status for the reports; the opt-out flag still stops all
 * WhatsApp messages there.
 */
export const OPT_OUT_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "IN_CHAT", "NO_RESPONSE"];

/** New status after an opt-out, or null when the status stays. */
export function statusAfterOptOut(status: LeadStatus): LeadStatus | null {
  return OPT_OUT_STATUSES.includes(status) ? "OPTED_OUT" : null;
}
