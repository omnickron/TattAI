-- AlterTable
ALTER TABLE "LeadAttachment" ADD COLUMN     "consultationId" TEXT;

-- CreateIndex
CREATE INDEX "LeadAttachment_consultationId_idx" ON "LeadAttachment"("consultationId");

-- AddForeignKey
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing files: attach to the lead's most recent (non-cancelled) consultation
UPDATE "LeadAttachment" a SET "consultationId" = (
  SELECT c."id" FROM "Consultation" c
  WHERE c."leadId" = a."leadId" AND c."walkIn" = false AND c."status" <> 'CANCELLED'
  ORDER BY c."startsAt" DESC LIMIT 1
);
