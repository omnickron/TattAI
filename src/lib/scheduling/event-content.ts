import type { CalendarEventInput } from "../google/calendar";
import { formatEuro } from "../outcomes/money";

export type ConsultationModeValue = "ON_SITE" | "PHONE";

export const CONSULTATION_MODE_LABELS: Record<ConsultationModeValue, string> = {
  ON_SITE: "Vor Ort",
  PHONE: "Telefon",
};

/** Structured tattoo idea as delivered by the chatbot (phase 3). All fields optional. */
export interface TattooSummary {
  motif?: string;
  placement?: string;
  size?: string;
  style?: string;
  color?: "color" | "black_grey" | string;
  coverUp?: boolean;
  referenceImageCount?: number;
  timeframe?: string;
  notes?: string;
}

const SUMMARY_LABELS: Array<[keyof TattooSummary, string]> = [
  ["motif", "Motiv"],
  ["placement", "Körperstelle"],
  ["size", "Größe"],
  ["style", "Stil"],
  ["color", "Farbe"],
  ["coverUp", "Cover-up"],
  ["referenceImageCount", "Referenzbilder"],
  ["timeframe", "Zeitrahmen"],
  ["notes", "Sonstiges"],
];

function formatSummaryValue(key: keyof TattooSummary, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (key === "coverUp") return value ? "ja" : "nein";
  if (key === "color")
    return value === "color" ? "farbig" : value === "black_grey" ? "schwarz-grau" : String(value);
  if (key === "referenceImageCount") return `${value} (in der App)`;
  return String(value);
}

function motifOf(summary: unknown): string | null {
  const motif = (summary as TattooSummary | null)?.motif;
  return typeof motif === "string" && motif.trim() ? motif.trim() : null;
}

export function summaryLines(summary: unknown): string[] {
  if (!summary || typeof summary !== "object") return [];
  const s = summary as TattooSummary;
  return SUMMARY_LABELS.flatMap(([key, label]) => {
    const value = formatSummaryValue(key, s[key]);
    return value ? [`${label}: ${value}`] : [];
  });
}

export interface EventContentInput {
  lead: {
    id: string;
    name: string;
    phoneE164: string | null;
    email: string | null;
    tattooSummary: unknown;
  };
  mode: ConsultationModeValue;
  start: Date;
  end: Date;
  studioAddress: string | null;
  appUrl: string;
  timeZone: string;
}

/** Calendar event for a consultation. Contains customer data → event is private. */
export function buildConsultationEvent(input: EventContentInput): CalendarEventInput {
  const { lead, mode } = input;
  const lines = [
    `Motiv: ${motifOf(lead.tattooSummary) ?? "noch offen"}`,
    `Beratungsform: ${mode === "PHONE" ? "Telefon – bitte Kunden anrufen" : "Vor Ort im Studio"}`,
    `Telefon: ${lead.phoneE164 ?? "–"}`,
    ...(lead.email ? [`E-Mail: ${lead.email}`] : []),
  ];
  const summary = summaryLines(lead.tattooSummary);
  lines.push("", "Tattoo-Idee:", ...(summary.length ? summary : ["(noch keine Zusammenfassung)"]));
  lines.push("", `In der App: ${input.appUrl.replace(/\/$/, "")}/leads/${lead.id}`);

  return {
    summary: `Beratung: ${lead.name}${mode === "PHONE" ? " (Telefon)" : ""}`,
    description: lines.join("\n"),
    location: mode === "ON_SITE" ? input.studioAddress : null,
    start: input.start,
    end: input.end,
    timeZone: input.timeZone,
  };
}

export interface TattooEventInput {
  lead: {
    id: string;
    name: string;
    phoneE164: string | null;
    email: string | null;
    tattooSummary: unknown;
  };
  sessionNumber: number;
  multipleSessions: boolean;
  /** Timed session, or null for an all-day entry on `localDate` */
  slot: { start: Date; end: Date } | null;
  localDate: string;
  nextLocalDate: string;
  studioAddress: string | null;
  note: string | null;
  /** Price of this session and of the whole tattoo (all non-cancelled sessions), in cents */
  amountCents?: number | null;
  totalCents?: number | null;
  appUrl: string;
  timeZone: string;
}

function priceLine(
  input: Pick<TattooEventInput, "amountCents" | "totalCents" | "multipleSessions">,
) {
  const price =
    input.amountCents != null ? formatEuro(input.amountCents) : "noch nicht eingetragen";
  if (input.multipleSessions && input.totalCents) {
    return `Preis: ${price} (gesamt ${formatEuro(input.totalCents)})`;
  }
  return `Preis: ${price}`;
}

/** Calendar event for a tattoo session (same calendar as the consultations). */
export function buildTattooEvent(input: TattooEventInput): CalendarEventInput {
  const { lead } = input;
  const lines = [
    `Motiv: ${motifOf(lead.tattooSummary) ?? "–"}`,
    priceLine(input),
    "",
    `Telefon: ${lead.phoneE164 ?? "–"}`,
    ...(lead.email ? [`E-Mail: ${lead.email}`] : []),
  ];
  const summary = summaryLines(lead.tattooSummary).filter((l) => !l.startsWith("Referenzbilder"));
  if (summary.length) lines.push("", "Tattoo-Idee:", ...summary);
  if (input.note) lines.push("", `Notiz: ${input.note}`);
  if (!input.slot) lines.push("", "(Uhrzeit noch nicht eingetragen)");
  lines.push("", `In der App: ${input.appUrl.replace(/\/$/, "")}/leads/${lead.id}`);
  return {
    summary: `Tattoo: ${lead.name}${input.multipleSessions ? ` – Termin ${input.sessionNumber}` : ""}`,
    description: lines.join("\n"),
    location: input.studioAddress,
    start: input.slot?.start ?? new Date(`${input.localDate}T00:00:00Z`),
    end: input.slot?.end ?? new Date(`${input.nextLocalDate}T00:00:00Z`),
    timeZone: input.timeZone,
    ...(input.slot ? {} : { allDay: { startDate: input.localDate, endDate: input.nextLocalDate } }),
  };
}
