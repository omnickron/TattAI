-- CreateEnum
CREATE TYPE "TemplatePurpose" AS ENUM ('FIRST_CONTACT', 'FOLLOW_UP', 'REMINDER');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('UTILITY', 'MARKETING');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "OutboundKind" AS ENUM ('FIRST_CONTACT', 'FOLLOW_UP', 'REMINDER');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "firstContactedAt" TIMESTAMP(3),
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastOutboundAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "errorCode" INTEGER,
ADD COLUMN     "outboundId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "purpose" "TemplatePurpose" NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'de',
    "category" "TemplateCategory" NOT NULL DEFAULT 'UTILITY',
    "bodyText" TEXT NOT NULL,
    "approvedText" TEXT,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "metaTemplateId" TEXT,
    "rejectedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "sendingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "sendTimes" JSONB NOT NULL DEFAULT '[]',
    "batchWindowMinutes" INTEGER NOT NULL DEFAULT 90,
    "maxPerBatch" INTEGER NOT NULL DEFAULT 15,
    "maxPerDay" INTEGER NOT NULL DEFAULT 40,
    "minGapSeconds" INTEGER NOT NULL DEFAULT 60,
    "maxGapSeconds" INTEGER NOT NULL DEFAULT 180,
    "warmupStartDate" DATE,
    "warmupStartPerDay" INTEGER NOT NULL DEFAULT 10,
    "warmupIncreasePerDay" INTEGER NOT NULL DEFAULT 5,
    "noResponseAfterHours" INTEGER NOT NULL DEFAULT 48,
    "firstContactTemplateId" TEXT,
    "nextSendAllowedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpStep" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delayHours" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "hoursBefore" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "consultationId" TEXT,
    "kind" "OutboundKind" NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "notBefore" TIMESTAMP(3) NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "waMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppTemplate_name_language_key" ON "WhatsAppTemplate"("name", "language");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpStep_position_key" ON "FollowUpStep"("position");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_hoursBefore_key" ON "ReminderRule"("hoursBefore");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_dedupeKey_key" ON "OutboundMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_notBefore_idx" ON "OutboundMessage"("status", "notBefore");

-- CreateIndex
CREATE INDEX "OutboundMessage_leadId_idx" ON "OutboundMessage"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_outboundId_key" ON "Message"("outboundId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_outboundId_fkey" FOREIGN KEY ("outboundId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpStep" ADD CONSTRAINT "FollowUpStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderRule" ADD CONSTRAINT "ReminderRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

