import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, DEFAULT_TIME_ZONE, startOfLocalDay } from "../time";
import { buildReport, type ReportLead } from "./report";

export interface LoadReportOptions {
  from: string;
  to: string;
  campaign?: string | null;
  tattooerId?: string | null;
  now: Date;
  timeZone?: string;
}

/** Leads of the period (by arrival) with their consultations and sessions → report. */
export async function loadReport(
  prisma: Pick<PrismaClient, "lead">,
  { from, to, campaign, tattooerId, now, timeZone = DEFAULT_TIME_ZONE }: LoadReportOptions,
) {
  const rows = await prisma.lead.findMany({
    where: {
      createdAt: {
        gte: startOfLocalDay(from, timeZone),
        lt: startOfLocalDay(addDays(to, 1), timeZone),
      },
      ...(campaign
        ? campaign === "none"
          ? { metaCampaignId: null }
          : { metaCampaignId: campaign }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      source: true,
      metaCampaignId: true,
      metaCampaignName: true,
      consultations: {
        select: {
          tattooerId: true,
          status: true,
          startsAt: true,
          endsAt: true,
          tattooBooked: true,
          walkIn: true,
          tattooBookings: { select: { date: true, amountCents: true, cancelled: true } },
        },
      },
    },
  });
  const leads: ReportLead[] = rows.map((l) => ({
    id: l.id,
    createdAt: l.createdAt,
    source: l.source,
    campaignId: l.metaCampaignId,
    campaignName: l.metaCampaignName,
    consultations: l.consultations.map(({ tattooBookings, ...c }) => ({
      ...c,
      sessions: tattooBookings,
    })),
  }));
  return buildReport(leads, { now, from, to, tattooerId, timeZone });
}
