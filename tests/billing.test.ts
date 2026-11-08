import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  billingConfigFromEnv,
  cancelInvoice,
  computeAmounts,
  createInvoice,
  loadMonthRevenue,
  loadBillingConfig,
  mergeBillingConfig,
  setInvoicePaid,
  shiftMonth,
  type BillingConfig,
} from "@/lib/billing/billing";
import { isOperator } from "@/lib/auth/operator";
import { sessionDate } from "@/lib/outcomes/outcome";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const TZ = "Europe/Berlin";

const config: BillingConfig = {
  commissionBps: 1500,
  vatBps: 1900,
  paymentDays: 14,
  issuer: {
    name: "NEEDL – Nick",
    address: "Musterweg 1\n10115 Berlin",
    taxId: "12/345/67890",
    iban: "DE00 0000 0000 0000 0000 00",
    email: "rechnung@needl-booker.de",
  },
};

let tattooerId: string;
let consultationId: string;

/** By default the customer showed up and paid the planned price (price final). */
async function session(
  date: string,
  amount: number | null,
  opts: { cancelled?: boolean; open?: boolean; deposit?: number; depositKept?: boolean } = {},
) {
  const settled = !opts.open && !opts.cancelled && amount !== null;
  return prisma.tattooBooking.create({
    data: {
      consultationId,
      date: sessionDate(date, TZ),
      amountCents: amount,
      depositCents: opts.deposit ?? null,
      depositKept: opts.depositKept ?? false,
      cancelled: opts.cancelled ?? false,
      ...(settled ? { attendance: "ATTENDED" as const, finalAmountCents: amount } : {}),
    },
  });
}

afterAll(() => prisma.$disconnect());

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.appSettings.create({
    data: { id: 1, studioName: "Black Rose Tattoo", studioAddress: "Studiostraße 2, Berlin" },
  });
  const u = await prisma.user.create({
    data: {
      name: "Kim",
      email: "kim@example.com",
      role: "TATTOOER",
      tattooerProfile: { create: {} },
    },
    include: { tattooerProfile: true },
  });
  tattooerId = u.tattooerProfile!.id;
  const lead = await prisma.lead.create({ data: { source: "META_LEAD_AD", name: "Mia" } });
  consultationId = (
    await prisma.consultation.create({
      data: {
        leadId: lead.id,
        tattooerId,
        startsAt: new Date("2026-10-01T08:00:00Z"),
        endsAt: new Date("2026-10-01T08:30:00Z"),
        status: "HELD",
        tattooBooked: true,
      },
    })
  ).id;
});

describe("monthly revenue", () => {
  it("counts non-cancelled sessions by their local date, also around the time change", async () => {
    await session("2026-09-30", 10000); // September
    await session("2026-10-01", 20000);
    await session("2026-10-25", 30000); // day of the switch to winter time
    await session("2026-10-31", 40000); // last day
    await session("2026-11-01", 50000); // November
    await session("2026-10-15", 99900, { cancelled: true });
    await session("2026-10-20", null); // amount still missing
    const r = await loadMonthRevenue(prisma, "2026-10", TZ);
    expect(r).toMatchObject({ revenueCents: 90000, sessionCount: 4, missingAmounts: 1 });
    expect(r.byTattooer).toEqual([{ name: "Kim", revenueCents: 90000, sessions: 4 }]);
  });

  it("bills only customers from Meta ads and shows the rest separately", async () => {
    await session("2026-10-05", 40000);
    const manual = await prisma.lead.create({ data: { source: "MANUAL", name: "Walk-in" } });
    const c2 = await prisma.consultation.create({
      data: {
        leadId: manual.id,
        tattooerId,
        walkIn: true,
        startsAt: new Date("2026-10-06T08:00:00Z"),
        endsAt: new Date("2026-10-06T08:00:00Z"),
        status: "HELD",
        tattooBooked: true,
      },
    });
    await prisma.tattooBooking.create({
      data: { consultationId: c2.id, date: sessionDate("2026-10-06", TZ), amountCents: 25000 },
    });
    const r = await loadMonthRevenue(prisma, "2026-10", TZ);
    expect(r).toMatchObject({ revenueCents: 40000, sessionCount: 1 });
    expect(r.other).toEqual({ revenueCents: 25000, sessionCount: 1 });
    expect(r.lines.map((l) => l.leadName)).toEqual(["Mia"]);
  });

  it("ignores sessions of tattoos that were revised to 'no tattoo'", async () => {
    await session("2026-10-10", 30000);
    await prisma.consultation.update({
      where: { id: consultationId },
      data: { tattooBooked: false },
    });
    expect((await loadMonthRevenue(prisma, "2026-10", TZ)).revenueCents).toBe(0);
  });
});

describe("invoices", () => {
  it("computes 15 % commission plus VAT with whole cents", () => {
    expect(computeAmounts(123456, config)).toEqual({
      netCents: 18518,
      vatCents: 3518,
      grossCents: 22036,
    });
    expect(computeAmounts(100000, { commissionBps: 1500, vatBps: 0 })).toEqual({
      netCents: 15000,
      vatCents: 0,
      grossCents: 15000,
    });
  });

  it("creates numbered invoices for finished months and freezes the numbers", async () => {
    await session("2026-10-12", 80000);
    const now = new Date("2026-11-05T10:00:00Z");
    const inv = await createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ });
    expect(inv).toMatchObject({
      number: "2026-001",
      period: "2026-10",
      revenueCents: 80000,
      sessionCount: 1,
      netCents: 12000,
      vatCents: 2280,
      grossCents: 14280,
      status: "OPEN",
    });
    expect(inv.dueAt.toISOString()).toBe("2026-11-19T10:00:00.000Z");
    expect(inv.recipient).toMatchObject({ name: "Black Rose Tattoo" });

    // Later changes don't alter the invoice
    await session("2026-10-20", 10000);
    const again = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(again.revenueCents).toBe(80000);

    // One active invoice per month; after cancelling, a new one gets the next number
    await expect(
      createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ }),
    ).rejects.toThrow(/schon die Rechnung 2026-001/);
    await cancelInvoice(prisma, inv.id, now);
    const second = await createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ });
    expect(second).toMatchObject({ number: "2026-002", revenueCents: 90000 });

    await setInvoicePaid(prisma, second.id, true, now);
    await expect(cancelInvoice(prisma, second.id, now)).rejects.toThrow(/Bezahlte/);
  });

  it("waits until every session of the month has attendance and final price", async () => {
    await session("2026-10-12", 80000);
    const open = await session("2026-10-20", 30000, { open: true });
    const now = new Date("2026-11-05T10:00:00Z");
    const r = await loadMonthRevenue(prisma, "2026-10", TZ);
    expect(r.openLines.map((l) => l.sessionId)).toEqual([open.id]);
    await expect(
      createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ }),
    ).rejects.toThrow(/einem Tattoo-Termin fehlt noch/);
    await prisma.tattooBooking.update({
      where: { id: open.id },
      data: { attendance: "ATTENDED", finalAmountCents: 35000 },
    });
    const inv = await createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ });
    expect(inv.revenueCents).toBe(115000);
  });

  it("bills kept deposits of no-shows and short-notice cancellations", async () => {
    const noShow = await session("2026-10-05", 50000, { open: true, deposit: 10000 });
    await prisma.tattooBooking.update({
      where: { id: noShow.id },
      data: { attendance: "NO_SHOW" },
    });
    await session("2026-10-06", 40000, { cancelled: true, deposit: 8000, depositKept: true });
    await session("2026-10-07", 40000, { cancelled: true, deposit: 8000 }); // returned
    const r = await loadMonthRevenue(prisma, "2026-10", TZ);
    expect(r).toMatchObject({ revenueCents: 18000, sessionCount: 2, openLines: [] });
    expect(r.lines.map((l) => [l.amountCents, l.attendance ?? null, l.cancelled])).toEqual([
      [10000, "NO_SHOW", false],
      [8000, null, true],
    ]);
  });

  it("refuses running months, months without revenue and missing issuer data", async () => {
    const now = new Date("2026-11-05T10:00:00Z");
    await expect(
      createInvoice(prisma, { month: "2026-10", config, now, timeZone: TZ }),
    ).rejects.toThrow(/keinen Tattoo-Umsatz/);
    await session("2026-10-03", 5000);
    await expect(
      createInvoice(prisma, { month: "2026-11", config, now, timeZone: TZ }),
    ).rejects.toThrow(/Monat vorbei/);
    await expect(
      createInvoice(prisma, {
        month: "2026-10",
        config: { ...config, issuer: { ...config.issuer, taxId: "" } },
        now,
        timeZone: TZ,
      }),
    ).rejects.toThrow(/Rechnungsdaten/);
  });

  it("reads rates and issuer from the environment", () => {
    const cfg = billingConfigFromEnv({
      BILLING_COMMISSION_PERCENT: "12,5",
      BILLING_VAT_PERCENT: "0",
      BILLING_ISSUER_ADDRESS: "Weg 1\\n12345 Ort",
    } as unknown as NodeJS.ProcessEnv);
    expect(cfg).toMatchObject({ commissionBps: 1250, vatBps: 0, paymentDays: 14 });
    expect(cfg.issuer.address).toBe("Weg 1\n12345 Ort");
    expect(billingConfigFromEnv({} as unknown as NodeJS.ProcessEnv).commissionBps).toBe(1500);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("billing settings in the app", () => {
  it("override the server environment field by field", async () => {
    const env = {
      BILLING_COMMISSION_PERCENT: "15",
      BILLING_ISSUER_NAME: "Env GmbH",
      BILLING_ISSUER_IBAN: "DE00ENV",
    } as unknown as NodeJS.ProcessEnv;
    expect((await loadBillingConfig(prisma, env)).issuer.name).toBe("Env GmbH");
    await prisma.billingSettings.create({
      data: { id: 1, commissionBps: 1200, issuerName: "App GmbH", issuerIban: "  " },
    });
    const cfg = await loadBillingConfig(prisma, env);
    expect(cfg).toMatchObject({ commissionBps: 1200, vatBps: 1900 });
    expect(cfg.issuer).toMatchObject({ name: "App GmbH", iban: "DE00ENV" });
    expect(mergeBillingConfig(cfg, null)).toBe(cfg);
  });

  it("are editable only by the operator", () => {
    const before = process.env.OPERATOR_EMAIL;
    process.env.OPERATOR_EMAIL = "Nick@Example.com";
    expect(isOperator({ email: "nick@example.com" })).toBe(true);
    expect(isOperator({ email: "studio@example.com" })).toBe(false);
    process.env.OPERATOR_EMAIL = "";
    expect(isOperator({ email: "nick@example.com" })).toBe(false);
    process.env.OPERATOR_EMAIL = before;
  });
});
