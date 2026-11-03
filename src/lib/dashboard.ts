import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { leadScope, type CurrentUser } from "./auth/session";
import { prisma } from "./db";
import { APP_TIMEZONE } from "./format";
import { addDays, localDateOf, startOfLocalDay, startOfWeek } from "./time";

const DAY = 24 * 3600_000;

/** Everything the start page needs, scoped to the user (admin: all, tattooer: own). */
export async function loadDashboard(user: CurrentUser, now = new Date()) {
  const isAdmin = user.role === "ADMIN";
  const own: Prisma.ConsultationWhereInput = isAdmin
    ? {}
    : { tattooerId: user.tattooerProfile?.id ?? "__none__" };
  const today = localDateOf(now, APP_TIMEZONE);
  const dayStart = startOfLocalDay(today, APP_TIMEZONE);
  const dayEnd = startOfLocalDay(addDays(today, 1), APP_TIMEZONE);
  const weekStartDate = startOfWeek(today);
  const weekStart = startOfLocalDay(weekStartDate, APP_TIMEZONE);
  const weekEnd = startOfLocalDay(addDays(weekStartDate, 7), APP_TIMEZONE);

  const sessionScope = (from: Date, to: Date): Prisma.TattooBookingWhereInput => ({
    cancelled: false,
    consultation: { ...own, status: "HELD", tattooBooked: true },
    OR: [{ startsAt: { gte: from, lt: to } }, { startsAt: null, date: { gte: from, lt: to } }],
  });

  const [
    openOutcomes,
    openCount,
    todayConsultations,
    todaySessions,
    weekConsultations,
    weekSessions,
    recentAuto,
  ] = await Promise.all([
    prisma.consultation.findMany({
      where: { ...own, status: "SCHEDULED", endsAt: { lte: now } },
      orderBy: { startsAt: "desc" },
      take: 3,
      include: {
        lead: { select: { id: true, name: true } },
        tattooer: { include: { user: { select: { name: true } } } },
        tattooBookings: true,
      },
    }),
    prisma.consultation.count({ where: { ...own, status: "SCHEDULED", endsAt: { lte: now } } }),
    prisma.consultation.findMany({
      where: { ...own, status: { not: "CANCELLED" }, startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startsAt: "asc" },
      include: {
        lead: { select: { id: true, name: true, phoneE164: true } },
        tattooer: { include: { user: { select: { name: true } } } },
      },
    }),
    prisma.tattooBooking.findMany({
      where: sessionScope(dayStart, dayEnd),
      orderBy: [{ startsAt: "asc" }],
      include: {
        consultation: {
          select: {
            lead: { select: { id: true, name: true, phoneE164: true } },
            tattooer: { select: { user: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.consultation.findMany({
      where: { ...own, status: { not: "CANCELLED" }, startsAt: { gte: weekStart, lt: weekEnd } },
      select: { startsAt: true },
    }),
    prisma.tattooBooking.findMany({
      where: sessionScope(weekStart, weekEnd),
      select: { startsAt: true, date: true },
    }),
    // Latest automatic/bot messages (no human author) to leads in scope
    prisma.message.findMany({
      where: { direction: "OUTBOUND", sentById: null, lead: leadScope(user) },
      orderBy: { sentAt: "desc" },
      take: 60,
      select: { leadId: true, sentAt: true },
    }),
  ]);

  // Today: one timeline of consultations and tattoo sessions
  type Item = {
    id: string;
    kind: "CONSULTATION" | "TATTOO";
    start: Date | null;
    end: Date | null;
    leadId: string;
    leadName: string;
    phone: string | null;
    tattooerName: string;
    mode: "ON_SITE" | "PHONE" | null;
    status: string;
  };
  const items: Item[] = [
    ...todayConsultations.map((c) => ({
      id: c.id,
      kind: "CONSULTATION" as const,
      start: c.startsAt,
      end: c.endsAt,
      leadId: c.lead.id,
      leadName: c.lead.name,
      phone: c.lead.phoneE164,
      tattooerName: c.tattooer.user.name,
      mode: c.mode,
      status: c.status,
    })),
    ...todaySessions.map((s) => ({
      id: s.id,
      kind: "TATTOO" as const,
      start: s.startsAt,
      end: s.endsAt,
      leadId: s.consultation.lead.id,
      leadName: s.consultation.lead.name,
      phone: s.consultation.lead.phoneE164,
      tattooerName: s.consultation.tattooer.user.name,
      mode: null,
      status: "TATTOO",
    })),
  ].sort((a, b) => (a.start?.getTime() ?? 0) - (b.start?.getTime() ?? 0));
  const timed = items.filter((i) => i.start && i.end);
  const currentId = timed.find((i) => i.start! <= now && i.end! > now)?.id ?? null;
  const nextId = timed.find((i) => i.start! > now)?.id ?? null;

  // This week, per local day
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i));
  const perDay = days.map((d) => ({
    date: d,
    consultations: weekConsultations.filter((c) => localDateOf(c.startsAt, APP_TIMEZONE) === d)
      .length,
    tattoos: weekSessions.filter((s) => localDateOf(s.startsAt ?? s.date, APP_TIMEZONE) === d)
      .length,
  }));

  // Last 5 leads contacted automatically/by the bot, with their latest chat message
  const leadIds: string[] = [];
  for (const m of recentAuto) {
    if (!leadIds.includes(m.leadId)) leadIds.push(m.leadId);
    if (leadIds.length === 5) break;
  }
  const contactLeads = await prisma.lead.findMany({
    where: { id: { in: leadIds } },
    select: {
      id: true,
      name: true,
      status: true,
      botEnabled: true,
      messages: {
        orderBy: { sentAt: "desc" },
        take: 1,
        select: {
          body: true,
          direction: true,
          sentAt: true,
          sentByBot: true,
          sentById: true,
          templateName: true,
        },
      },
    },
  });
  const contacts = leadIds
    .map((id) => contactLeads.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l));

  return {
    isAdmin,
    openOutcomes,
    openCount,
    today: { items, currentId, nextId, dayStart },
    week: {
      start: weekStart,
      end: new Date(weekEnd.getTime() - DAY),
      days: perDay,
      consultations: weekConsultations.length,
      tattoos: weekSessions.length,
      today,
    },
    contacts,
  };
}
