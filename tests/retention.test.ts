import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { purgeStaleLeads, retentionCutoff } from "@/lib/leads/retention";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
const NOW = new Date("2026-11-07T10:00:00Z");
const ago = (months: number, days = 0) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
};

async function lead(name: string, at: Date, extra: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: { source: "META_LEAD_AD", name, createdAt: at, statusChangedAt: at, ...extra },
  });
}

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

describe("lead retention (10 months)", () => {
  it("deletes only leads without any appointment and without activity for 10 months", async () => {
    const tattooer = await prisma.user.create({
      data: {
        name: "Kim",
        email: "kim@example.com",
        role: "TATTOOER",
        tattooerProfile: { create: {} },
      },
      include: { tattooerProfile: true },
    });
    const old = await lead("Alt", ago(11));
    const recent = await lead("Neu", ago(9));
    const chattedLately = await lead("Chat", ago(12), { lastInboundAt: ago(2) });
    const withConsultation = await lead("Kunde", ago(14));
    await prisma.consultation.create({
      data: {
        leadId: withConsultation.id,
        tattooerId: tattooer.tattooerProfile!.id,
        startsAt: ago(13),
        endsAt: ago(13),
        status: "CANCELLED",
      },
    });
    await prisma.message.create({ data: { leadId: old.id, direction: "INBOUND", body: "Hi" } });

    const filesDeleted: string[] = [];
    const r = await purgeStaleLeads(prisma, {
      now: NOW,
      deleteFiles: async (id) => void filesDeleted.push(id),
    });
    expect(r.deleted).toBe(1);
    expect(filesDeleted).toEqual([old.id]);
    const left = (await prisma.lead.findMany({ select: { id: true } })).map((l) => l.id).sort();
    expect(left).toEqual([recent.id, chattedLately.id, withConsultation.id].sort());
    expect(await prisma.message.count()).toBe(0);
  });

  it("computes the cutoff 10 months back", () => {
    expect(retentionCutoff(NOW).toISOString()).toBe("2026-01-07T10:00:00.000Z");
  });
});
