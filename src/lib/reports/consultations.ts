/**
 * Consultation analysis by consultation date: how many take place, are cancelled
 * or are no-shows. Walk-ins (no consultation) and cancellations that only happened
 * because an appointment was moved to a new one are not counted.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { addDays, DEFAULT_TIME_ZONE, startOfLocalDay } from "../time";

export interface ConsultationRow {
  status: "SCHEDULED" | "HELD" | "NO_SHOW" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
  cancelledAt: Date | null;
  tattooerId: string;
  mode: "ON_SITE" | "PHONE";
}

export interface ConsultationStats {
  /** All consultations in the period */
  total: number;
  held: number;
  noShow: number;
  cancelled: number;
  /** Cancelled less than 24 h before the start (or afterwards) */
  cancelledShortNotice: number;
  /** Over, but no outcome entered yet */
  open: number;
  /** Still ahead */
  upcoming: number;
  /** Shares of the decided ones (held + no-show + cancelled); null without any */
  heldRate: number | null;
  noShowRate: number | null;
  cancelRate: number | null;
}

const DAY = 86_400_000;

export function consultationStats(rows: ConsultationRow[], now: Date): ConsultationStats {
  const s = {
    total: rows.length,
    held: 0,
    noShow: 0,
    cancelled: 0,
    cancelledShortNotice: 0,
    open: 0,
    upcoming: 0,
  };
  for (const r of rows) {
    if (r.status === "HELD") s.held++;
    else if (r.status === "NO_SHOW") s.noShow++;
    else if (r.status === "CANCELLED") {
      s.cancelled++;
      const at = r.cancelledAt ?? r.startsAt;
      if (r.startsAt.getTime() - at.getTime() < DAY) s.cancelledShortNotice++;
    } else if (r.endsAt <= now) s.open++;
    else s.upcoming++;
  }
  const decided = s.held + s.noShow + s.cancelled;
  const rate = (n: number) => (decided ? n / decided : null);
  return {
    ...s,
    heldRate: rate(s.held),
    noShowRate: rate(s.noShow),
    cancelRate: rate(s.cancelled),
  };
}

export async function loadConsultationStats(
  prisma: Pick<PrismaClient, "consultation">,
  opts: {
    from: string;
    to: string;
    now: Date;
    campaign?: string | null;
    tattooerId?: string | null;
    timeZone?: string;
  },
) {
  const tz = opts.timeZone ?? DEFAULT_TIME_ZONE;
  const rows = await prisma.consultation.findMany({
    where: {
      walkIn: false,
      rescheduled: false,
      startsAt: {
        gte: startOfLocalDay(opts.from, tz),
        lt: startOfLocalDay(addDays(opts.to, 1), tz),
      },
      ...(opts.tattooerId ? { tattooerId: opts.tattooerId } : {}),
      ...(opts.campaign
        ? { lead: { metaCampaignId: opts.campaign === "none" ? null : opts.campaign } }
        : {}),
    },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      cancelledAt: true,
      tattooerId: true,
      mode: true,
    },
  });
  const group = (key: (r: ConsultationRow) => string) => {
    const map = new Map<string, ConsultationRow[]>();
    for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
    return [...map.entries()]
      .map(([k, list]) => ({ key: k, stats: consultationStats(list, opts.now) }))
      .sort((a, b) => b.stats.total - a.stats.total);
  };
  return {
    totals: consultationStats(rows, opts.now),
    byTattooer: group((r) => r.tattooerId),
    byMode: group((r) => r.mode),
  };
}
