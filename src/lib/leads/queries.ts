import "server-only";
import type { LeadStatus, Prisma } from "@/generated/prisma/client";
import { leadScope, type CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { LEAD_STATUS_ORDER } from "@/lib/labels";

export const LEADS_PAGE_SIZE = 50;

export interface LeadFilters {
  q?: string;
  status?: LeadStatus;
  campaign?: string;
  page: number;
}

export function parseLeadFilters(
  params: Record<string, string | string[] | undefined>,
): LeadFilters {
  const str = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string).trim() : "";
  const status = str("status") as LeadStatus;
  const page = Number.parseInt(str("page"), 10);
  return {
    q: str("q") || undefined,
    status: LEAD_STATUS_ORDER.includes(status) ? status : undefined,
    campaign: str("campaign") || undefined,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

function searchWhere(q: string): Prisma.LeadWhereInput {
  const or: Prisma.LeadWhereInput[] = [
    { name: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
  ];
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 4) {
    or.push({ phoneE164: { contains: digits.replace(/^0+/, "") } });
    or.push({ phoneRaw: { contains: q } });
  }
  return { OR: or };
}

export async function listLeads(user: CurrentUser, filters: LeadFilters) {
  const scope = leadScope(user);
  const where: Prisma.LeadWhereInput = {
    AND: [
      scope,
      filters.status ? { status: filters.status } : {},
      filters.campaign ? { metaCampaignId: filters.campaign } : {},
      filters.q ? searchWhere(filters.q) : {},
    ],
  };

  const [leads, total, statusCounts, campaigns] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * LEADS_PAGE_SIZE,
      take: LEADS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        phoneE164: true,
        phoneRaw: true,
        phoneValid: true,
        email: true,
        status: true,
        whatsappConsent: true,
        botEnabled: true,
        metaCampaignName: true,
        metaPlatform: true,
        source: true,
        createdAt: true,
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["metaCampaignId", "metaCampaignName"],
      where: { AND: [scope, { metaCampaignId: { not: null } }] },
      _count: { _all: true },
      orderBy: { metaCampaignName: "asc" },
    }),
  ]);

  return {
    leads,
    total,
    pages: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])) as Partial<
      Record<LeadStatus, number>
    >,
    campaigns: campaigns.map((c) => ({
      id: c.metaCampaignId!,
      name: c.metaCampaignName ?? c.metaCampaignId!,
      count: c._count._all,
    })),
  };
}

export async function getLeadForUser(user: CurrentUser, id: string) {
  return prisma.lead.findFirst({
    where: { AND: [leadScope(user), { id }] },
    include: {
      notes: { orderBy: { createdAt: "desc" }, include: { author: { select: { name: true } } } },
      consultations: {
        orderBy: { startsAt: "desc" },
        include: {
          tattooer: { include: { user: { select: { name: true } } } },
          tattooBookings: { orderBy: { sessionNumber: "asc" } },
        },
      },
      // Latest 200 messages (re-sorted ascending on the page)
      messages: {
        orderBy: { sentAt: "desc" },
        take: 200,
        include: { sentBy: { select: { name: true } } },
      },
      botDisabledBy: { select: { name: true } },
      attachments: {
        where: { status: { in: ["STORED", "PENDING"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, status: true, mimeType: true, caption: true, createdAt: true },
      },
      outboundMessages: {
        where: { status: { in: ["QUEUED", "FAILED"] } },
        orderBy: { notBefore: "asc" },
        include: { template: { select: { name: true } } },
      },
    },
  });
}
