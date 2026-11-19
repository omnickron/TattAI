import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { MetaTemplateInfo, WhatsAppClient } from "@/lib/whatsapp/client";
import { syncTemplatesFromMeta, templateVersion } from "@/lib/whatsapp/templates";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDatabase(prisma));

const client = (list: MetaTemplateInfo[]): WhatsAppClient => ({
  mock: false,
  sendTemplate: async () => ({ messageId: "x" }),
  sendText: async () => ({ messageId: "x" }),
  submitTemplate: async () => ({ id: "x", status: "PENDING" }),
  updateTemplate: async () => ({ status: "PENDING" }),
  listTemplates: async () => list,
});
const meta = (name: string, status: string, id = name, reason?: string): MetaTemplateInfo => ({
  id,
  name,
  language: "de",
  status,
  rejectedReason: reason ?? null,
});

describe("template sync with Meta", () => {
  it("knows the version of a submitted name", () => {
    expect(templateVersion("zweitkontakt", "zweitkontakt")).toBe(1);
    expect(templateVersion("zweitkontakt", "zweitkontakt_v12")).toBe(12);
    expect(templateVersion("zweitkontakt", "zweitkontakt_alt")).toBeNull();
    expect(templateVersion("zweit", "zweitkontakt_v2")).toBeNull();
  });

  it("drops a test-mode approval and takes over the approved new version", async () => {
    // Approved only in the test mode as "zweitkontakt", then "zweitkontakt_v2" went to Meta
    const t = await prisma.whatsAppTemplate.create({
      data: {
        purpose: "FOLLOW_UP",
        name: "zweitkontakt",
        bodyText: "Neu",
        status: "PENDING",
        submissionCount: 2,
        submittedName: "zweitkontakt_v2",
        submittedText: "Neu",
        approvedName: "zweitkontakt",
        approvedText: "Alt",
      },
    });
    // Still in review at Meta: nothing sendable (instead of sending an unknown name)
    await syncTemplatesFromMeta(prisma, client([meta("zweitkontakt_v2", "PENDING", "m2")]));
    let s = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect([s.status, s.approvedName, s.metaTemplateId]).toEqual(["PENDING", null, "m2"]);

    // Approved at Meta, the webhook got lost: the sync takes it over
    const res = await syncTemplatesFromMeta(
      prisma,
      client([meta("zweitkontakt_v2", "APPROVED", "m2"), meta("andere", "APPROVED")]),
    );
    expect(res.changed).toBe(1);
    s = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect([s.status, s.approvedName, s.approvedText]).toEqual([
      "APPROVED",
      "zweitkontakt_v2",
      "Neu",
    ]);
    // Nothing changed any more
    expect(
      (await syncTemplatesFromMeta(prisma, client([meta("zweitkontakt_v2", "APPROVED", "m2")])))
        .changed,
    ).toBe(0);
  });

  it("keeps sending the approved version while a newer one is rejected", async () => {
    const t = await prisma.whatsAppTemplate.create({
      data: { purpose: "FIRST_CONTACT", name: "erstkontakt", bodyText: "x", status: "PENDING" },
    });
    await syncTemplatesFromMeta(
      prisma,
      client([
        meta("erstkontakt", "APPROVED", "m1"),
        meta("erstkontakt_v2", "REJECTED", "m2", "INVALID_FORMAT"),
      ]),
    );
    const s = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect([s.status, s.approvedName, s.rejectedReason, s.submissionCount]).toEqual([
      "APPROVED",
      "erstkontakt",
      "INVALID_FORMAT",
      2,
    ]);
  });

  it("resets a template Meta does not know, so it is submitted again with its base name", async () => {
    const t = await prisma.whatsAppTemplate.create({
      data: {
        purpose: "REMINDER",
        name: "erinnerung",
        bodyText: "x",
        status: "APPROVED",
        submissionCount: 1,
        submittedName: "erinnerung",
        approvedName: "erinnerung",
        approvedText: "x",
      },
    });
    await syncTemplatesFromMeta(prisma, client([]));
    const s = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect([s.status, s.approvedName, s.submissionCount, s.submittedName]).toEqual([
      "DRAFT",
      null,
      0,
      null,
    ]);
  });
});
