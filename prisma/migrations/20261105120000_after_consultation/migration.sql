-- CreateEnum
CREATE TYPE "AfterConsultationCondition" AS ENUM ('HELD', 'TATTOO_BOOKED', 'UNDECIDED', 'NO_TATTOO', 'NO_SHOW');

-- AlterEnum
ALTER TYPE "OutboundKind" ADD VALUE 'AFTER_CONSULTATION';

-- AlterEnum
ALTER TYPE "TemplatePurpose" ADD VALUE 'AFTER_CONSULTATION';

-- AlterTable
ALTER TABLE "OutboundMessage" ADD COLUMN     "afterRuleId" TEXT;

-- CreateTable
CREATE TABLE "AfterConsultationRule" (
    "id" TEXT NOT NULL,
    "hoursAfter" INTEGER NOT NULL,
    "condition" "AfterConsultationCondition" NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfterConsultationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AfterConsultationRule_hoursAfter_condition_key" ON "AfterConsultationRule"("hoursAfter", "condition");

-- AddForeignKey
ALTER TABLE "AfterConsultationRule" ADD CONSTRAINT "AfterConsultationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_afterRuleId_fkey" FOREIGN KEY ("afterRuleId") REFERENCES "AfterConsultationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

