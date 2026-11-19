import type { PrismaClient } from "@/generated/prisma/client";
import type { WhatsAppClient } from "./client";
import { ALLOWED_VARIABLES, compileTemplate, exampleValues } from "./template-text";

export class TemplateError extends Error {}

/**
 * Submits the current text to Meta for review. The first submission uses the
 * base name; later changes are submitted as new versions ("name_v2", …) so the
 * approved version keeps being sent until the new one is approved.
 */
export async function submitTemplateForReview(
  prisma: PrismaClient,
  whatsapp: WhatsAppClient,
  templateId: string,
) {
  const t = await prisma.whatsAppTemplate.findUniqueOrThrow({ where: { id: templateId } });
  if (t.status === "PENDING")
    throw new TemplateError("Diese Version wird bereits von Meta geprüft.");
  if (t.approvedText === t.bodyText && t.status === "APPROVED") {
    throw new TemplateError("Der Text ist unverändert und bereits genehmigt.");
  }
  const compiled = compileTemplate(t.bodyText, ALLOWED_VARIABLES[t.purpose]);
  if (!compiled.ok) throw new TemplateError(compiled.error);

  const version = t.submissionCount + 1;
  const submittedName = version === 1 ? t.name : `${t.name}_v${version}`;
  const examples = exampleValues();
  const res = await whatsapp.submitTemplate({
    name: submittedName,
    language: t.language,
    category: t.category,
    text: compiled.value.metaText,
    examples: compiled.value.variables.map((v) => examples[v]),
  });

  const now = new Date();
  const approvedNow = res.status === "APPROVED";
  return prisma.whatsAppTemplate.update({
    where: { id: t.id },
    data: {
      submissionCount: version,
      submittedName,
      submittedText: t.bodyText,
      submittedAt: now,
      metaTemplateId: res.id,
      rejectedReason: null,
      status: approvedNow ? "APPROVED" : res.status === "REJECTED" ? "REJECTED" : "PENDING",
      ...(approvedNow
        ? { approvedName: submittedName, approvedText: t.bodyText, approvedAt: now }
        : {}),
    },
  });
}

/** Version number of a submitted name: "name" = 1, "name_v3" = 3, other names = null. */
export function templateVersion(baseName: string, name: string): number | null {
  if (name === baseName) return 1;
  const m = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}_v(\\d+)$`).exec(name);
  return m ? Number(m[1]) : null;
}

const META_STATUS: Record<string, "APPROVED" | "PENDING" | "REJECTED" | "PAUSED"> = {
  APPROVED: "APPROVED",
  PENDING: "PENDING",
  IN_APPEAL: "PENDING",
  REJECTED: "REJECTED",
  PAUSED: "PAUSED",
  DISABLED: "PAUSED",
  FLAGGED: "PAUSED",
  LIMIT_EXCEEDED: "PAUSED",
};

/**
 * Reads the real review status of all templates at Meta and corrects NEEDL: the newest
 * approved version is the one that gets sent; approvals that exist only in NEEDL (e.g. from
 * the test mode) are dropped, so nothing is sent under a name Meta does not know.
 */
export async function syncTemplatesFromMeta(prisma: PrismaClient, whatsapp: WhatsAppClient) {
  if (whatsapp.mock || !whatsapp.listTemplates) return { checked: 0, changed: 0 };
  const meta = await whatsapp.listTemplates();
  const templates = await prisma.whatsAppTemplate.findMany();
  let changed = 0;
  for (const t of templates) {
    const versions = meta
      .filter((m) => m.language === t.language)
      .map((m) => ({ ...m, version: templateVersion(t.name, m.name) }))
      .filter((m): m is typeof m & { version: number } => m.version !== null)
      .sort((a, b) => b.version - a.version);
    const latest = versions[0];
    const approved = versions.find((m) => m.status === "APPROVED");
    const latestStatus = latest ? (META_STATUS[latest.status] ?? "PENDING") : null;

    const approvedText = !approved
      ? null
      : approved.name === t.submittedName
        ? (t.submittedText ?? t.bodyText)
        : (t.approvedText ?? t.submittedText ?? t.bodyText);
    const data = {
      approvedName: approved?.name ?? null,
      approvedText,
      approvedAt: approved ? (t.approvedName === approved.name ? t.approvedAt : new Date()) : null,
      status: !latest
        ? approved
          ? ("APPROVED" as const)
          : ("DRAFT" as const)
        : latestStatus === "REJECTED" && approved
          ? ("APPROVED" as const)
          : latestStatus!,
      rejectedReason:
        latestStatus === "REJECTED" || latestStatus === "PAUSED"
          ? (latest!.rejectedReason ?? t.rejectedReason ?? latest!.status.toLowerCase())
          : null,
      // Unknown at Meta (e.g. only "approved" in the test mode): the next submission starts
      // again with the base name
      ...(latest
        ? {
            metaTemplateId: latest.id,
            submittedName: latest.name,
            submissionCount: Math.max(t.submissionCount, latest.version),
          }
        : { metaTemplateId: null, submittedName: null, submittedText: null, submissionCount: 0 }),
    };
    const differs =
      data.approvedName !== t.approvedName ||
      data.status !== t.status ||
      data.rejectedReason !== t.rejectedReason ||
      (latest
        ? latest.id !== t.metaTemplateId || latest.name !== t.submittedName
        : t.submissionCount !== 0);
    if (!differs) continue;
    await prisma.whatsAppTemplate.update({ where: { id: t.id }, data });
    changed++;
  }
  return { checked: templates.length, changed };
}
