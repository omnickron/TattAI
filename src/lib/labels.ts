import type { LeadStatus } from "@/generated/prisma/enums";

export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "IN_CHAT",
  "CONSULTATION_BOOKED",
  "CONSULTATION_DONE",
  "TATTOO_BOOKED",
  "NO_TATTOO",
  "NO_SHOW",
  "CANCELLED",
  "NO_RESPONSE",
  "INVALID",
];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Neu",
  CONTACTED: "Kontaktiert",
  IN_CHAT: "Im Chat",
  CONSULTATION_BOOKED: "Beratung gebucht",
  CONSULTATION_DONE: "Beratung erfolgt",
  TATTOO_BOOKED: "Tattoo gebucht",
  NO_TATTOO: "Kein Tattoo",
  NO_SHOW: "No-Show",
  CANCELLED: "Abgesagt",
  NO_RESPONSE: "Keine Antwort",
  INVALID: "Ungültig",
};

export const LEAD_STATUS_TONE: Record<
  LeadStatus,
  "blue" | "amber" | "green" | "red" | "gray" | "violet"
> = {
  NEW: "blue",
  CONTACTED: "violet",
  IN_CHAT: "violet",
  CONSULTATION_BOOKED: "amber",
  CONSULTATION_DONE: "amber",
  TATTOO_BOOKED: "green",
  NO_TATTOO: "gray",
  NO_SHOW: "red",
  CANCELLED: "gray",
  NO_RESPONSE: "gray",
  INVALID: "red",
};

export const PLATFORM_LABELS: Record<string, string> = { fb: "Facebook", ig: "Instagram" };
