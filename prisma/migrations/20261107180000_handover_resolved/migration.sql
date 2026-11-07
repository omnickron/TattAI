-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "botHandoverResolvedAt" TIMESTAMP(3),
ADD COLUMN     "botHandoverResolvedById" TEXT;


-- Handovers that were already dealt with under the old rules count as resolved
UPDATE "Lead" SET "botHandoverResolvedAt" = NOW()
WHERE "botHandoverAt" IS NOT NULL
  AND ("botEnabled" = true OR "botDisabledReason" IS DISTINCT FROM 'BOT_HANDOVER');
