/**
 * Monthly commission billing: the tattoo revenue of customers won through Meta ads in a month
 * (non-cancelled tattoo sessions with their date in that month, lead source = Meta lead ad)
 * × commission rate, plus VAT. Other customers (manual, walk-ins without ad) are shown but
 * not billed. Invoices freeze the numbers at creation.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_TIME_ZONE, localDateOf, startOfLocalDay } from "../time";

export interface BillingConfig {
  /** Commission in basis points (1500 = 15 %) */
  commissionBps: number;
  /** VAT in basis points (1900 = 19 %; 0 = small business, § 19 UStG) */
  vatBps: number;
  paymentDays: number;
  issuer: {
    name: string;
    address: string;
    taxId: string;
    iban: string;
    email: string;
  };
}

const percentToBps = (value: string | undefined, fallback: number) => {
  if (!value?.trim()) return fallback;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : fallback;
};

/** Set by the operator on the server (environment), not editable in the app. */
export function billingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  return {
    commissionBps: percentToBps(env.BILLING_COMMISSION_PERCENT, 1500),
    vatBps: percentToBps(env.BILLING_VAT_PERCENT, 1900),
    paymentDays: Math.max(0, Math.min(90, Number(env.BILLING_PAYMENT_DAYS) || 14)),
    issuer: {
      name: env.BILLING_ISSUER_NAME?.trim() || "",
      address: (env.BILLING_ISSUER_ADDRESS ?? "").replace(/\\n/g, "\n").trim(),
      taxId: env.BILLING_ISSUER_TAX_ID?.trim() || "",
      iban: env.BILLING_ISSUER_IBAN?.trim() || "",
      email: env.BILLING_ISSUER_EMAIL?.trim() || "",
    },
  };
}

export function issuerComplete(cfg: BillingConfig): boolean {
  return Boolean(cfg.issuer.name && cfg.issuer.address && cfg.issuer.taxId);
}

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function monthOf(date: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return localDateOf(date, timeZone).slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** [start, end) of a local month in UTC. */
export function monthRange(month: string, timeZone = DEFAULT_TIME_ZONE) {
  return {
    start: startOfLocalDay(`${month}-01`, timeZone),
    end: startOfLocalDay(`${shiftMonth(month, 1)}-01`, timeZone),
  };
}

const monthLabelFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const monthLabel = (month: string) =>
  monthLabelFmt.format(new Date(`${month}-15T12:00:00Z`));

/** Commission and VAT, each rounded to whole cents. */
export function computeAmounts(
  revenueCents: number,
  cfg: Pick<BillingConfig, "commissionBps" | "vatBps">,
) {
  const netCents = Math.round((revenueCents * cfg.commissionBps) / 10000);
  const vatCents = Math.round((netCents * cfg.vatBps) / 10000);
  return { netCents, vatCents, grossCents: netCents + vatCents };
}

export interface BillingLine {
  sessionId: string;
  date: string;
  leadName: string;
  tattooerName: string;
  amountCents: number | null;
  walkIn: boolean;
}

/** All non-cancelled tattoo sessions of the month (with date in the month). */
export async function loadMonthRevenue(
  prisma: Pick<PrismaClient, "tattooBooking">,
  month: string,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const { start, end } = monthRange(month, timeZone);
  const sessions = await prisma.tattooBooking.findMany({
    where: {
      cancelled: false,
      date: { gte: start, lt: end },
      consultation: { status: "HELD", tattooBooked: true },
    },
    orderBy: [{ date: "asc" }, { startsAt: "asc" }],
    select: {
      id: true,
      date: true,
      amountCents: true,
      consultation: {
        select: {
          walkIn: true,
          lead: { select: { name: true, source: true } },
          tattooer: { select: { id: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  // Only customers from Meta ads are billed
  const billable = sessions.filter((s) => s.consultation.lead.source === "META_LEAD_AD");
  const other = sessions.filter((s) => s.consultation.lead.source !== "META_LEAD_AD");
  const lines: BillingLine[] = billable.map((s) => ({
    sessionId: s.id,
    date: localDateOf(s.date, timeZone),
    leadName: s.consultation.lead.name,
    tattooerName: s.consultation.tattooer.user.name,
    amountCents: s.amountCents,
    walkIn: s.consultation.walkIn,
  }));
  const byTattooer = new Map<string, { name: string; revenueCents: number; sessions: number }>();
  for (const s of billable) {
    const t = s.consultation.tattooer;
    const row = byTattooer.get(t.id) ?? { name: t.user.name, revenueCents: 0, sessions: 0 };
    row.revenueCents += s.amountCents ?? 0;
    row.sessions++;
    byTattooer.set(t.id, row);
  }
  return {
    month,
    lines,
    revenueCents: lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0),
    sessionCount: lines.length,
    missingAmounts: lines.filter((l) => l.amountCents === null).length,
    byTattooer: [...byTattooer.values()].sort((a, b) => b.revenueCents - a.revenueCents),
    /** Not billed: customers that did not come from Meta ads */
    other: {
      revenueCents: other.reduce((sum, s) => sum + (s.amountCents ?? 0), 0),
      sessionCount: other.length,
    },
  };
}

export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

type BillingDb = Pick<PrismaClient, "tattooBooking" | "invoice" | "appSettings" | "$transaction">;

/** Creates the invoice of a finished month (one active invoice per month). */
export async function createInvoice(
  prisma: BillingDb,
  input: {
    month: string;
    createdById?: string;
    now?: Date;
    timeZone?: string;
    config: BillingConfig;
  },
) {
  const now = input.now ?? new Date();
  const tz = input.timeZone ?? DEFAULT_TIME_ZONE;
  const cfg = input.config;
  if (!isMonth(input.month)) throw new BillingError("Ungültiger Monat.");
  if (monthRange(input.month, tz).end > now)
    throw new BillingError("Rechnungen gibt es erst, wenn der Monat vorbei ist.");
  if (!issuerComplete(cfg))
    throw new BillingError(
      "Die Rechnungsdaten des Betreibers fehlen (Name, Anschrift, Steuernummer – Server-Einstellungen BILLING_ISSUER_*).",
    );

  const revenue = await loadMonthRevenue(prisma, input.month, tz);
  if (revenue.revenueCents <= 0)
    throw new BillingError(
      `Im ${monthLabel(input.month)} gab es keinen Tattoo-Umsatz – keine Rechnung nötig.`,
    );
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const amounts = computeAmounts(revenue.revenueCents, cfg);
  const year = input.month.slice(0, 4);

  return prisma.$transaction(async (tx) => {
    const active = await tx.invoice.findFirst({
      where: { period: input.month, status: { not: "CANCELLED" } },
    });
    if (active)
      throw new BillingError(
        `Für ${monthLabel(input.month)} gibt es schon die Rechnung ${active.number}.`,
      );
    const last = await tx.invoice.findFirst({
      where: { number: { startsWith: `${year}-` } },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const seq = last ? Number(last.number.split("-")[1]) + 1 : 1;
    return tx.invoice.create({
      data: {
        number: `${year}-${String(seq).padStart(3, "0")}`,
        period: input.month,
        issuedAt: now,
        dueAt: addDaysUtc(now, cfg.paymentDays),
        revenueCents: revenue.revenueCents,
        sessionCount: revenue.sessionCount,
        commissionBps: cfg.commissionBps,
        vatBps: cfg.vatBps,
        ...amounts,
        issuer: cfg.issuer,
        recipient: {
          name: settings?.studioName ?? "",
          address: settings?.studioAddress ?? "",
        },
        lines: revenue.lines as unknown as object,
        createdById: input.createdById ?? null,
      },
    });
  });
}

function addDaysUtc(d: Date, days: number) {
  return new Date(d.getTime() + days * 86_400_000);
}

export async function setInvoicePaid(
  prisma: Pick<PrismaClient, "invoice">,
  id: string,
  paid: boolean,
  now = new Date(),
) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new BillingError("Rechnung nicht gefunden.");
  if (inv.status === "CANCELLED") throw new BillingError("Die Rechnung ist storniert.");
  return prisma.invoice.update({
    where: { id },
    data: paid ? { status: "PAID", paidAt: now } : { status: "OPEN", paidAt: null },
  });
}

export async function cancelInvoice(
  prisma: Pick<PrismaClient, "invoice">,
  id: string,
  now = new Date(),
) {
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) throw new BillingError("Rechnung nicht gefunden.");
  if (inv.status === "PAID")
    throw new BillingError("Bezahlte Rechnungen können nicht storniert werden.");
  return prisma.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: now } });
}
