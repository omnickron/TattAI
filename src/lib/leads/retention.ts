/**
 * Retention (GDPR): leads that never got a consultation or walk-in appointment are deleted
 * 10 months after their last activity (created, last message in either direction, last
 * status change). Leads with any appointment stay – they belong to revenue and invoices.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { deleteLeadFiles } from "../whatsapp/media";

export const LEAD_RETENTION_MONTHS = 10;

export function retentionCutoff(now: Date, months = LEAD_RETENTION_MONTHS): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

export async function purgeStaleLeads(
  prisma: Pick<PrismaClient, "lead">,
  opts: {
    now?: Date;
    months?: number;
    limit?: number;
    deleteFiles?: (leadId: string) => Promise<void>;
  } = {},
) {
  const cutoff = retentionCutoff(opts.now ?? new Date(), opts.months);
  const stale = await prisma.lead.findMany({
    where: {
      consultations: { none: {} },
      createdAt: { lt: cutoff },
      statusChangedAt: { lt: cutoff },
      AND: [
        { OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }] },
        { OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: cutoff } }] },
      ],
    },
    select: { id: true },
    take: opts.limit ?? 500,
  });
  const removeFiles = opts.deleteFiles ?? ((id: string) => deleteLeadFiles(id));
  let deleted = 0;
  for (const { id } of stale) {
    // Messages, notes, attachments rows etc. go with the lead (cascade)
    const gone = await prisma.lead.delete({ where: { id } }).then(
      () => true,
      () => false,
    );
    if (!gone) continue;
    await removeFiles(id).catch((err) => console.error(`[retention] files of ${id}:`, err));
    deleted++;
  }
  return { deleted, cutoff };
}
