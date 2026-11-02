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
