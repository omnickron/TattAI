-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'STORED', 'FAILED');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "botDisabledAt" TIMESTAMP(3),
ADD COLUMN     "botDisabledById" TEXT,
ADD COLUMN     "botDisabledReason" TEXT,
ADD COLUMN     "botEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "sentByBot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MessagingSettings" ADD COLUMN     "botGloballyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LeadAttachment" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageId" TEXT,
    "waMediaId" TEXT,
    "mimeType" TEXT,
    "fileName" TEXT,
    "sizeBytes" INTEGER,
    "caption" TEXT,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "storagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotDelivery" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadAttachment_waMediaId_key" ON "LeadAttachment"("waMediaId");

-- CreateIndex
CREATE INDEX "LeadAttachment_leadId_idx" ON "LeadAttachment"("leadId");

-- CreateIndex
CREATE INDEX "LeadAttachment_status_idx" ON "LeadAttachment"("status");

-- CreateIndex
CREATE INDEX "BotDelivery_status_nextAttemptAt_idx" ON "BotDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_botDisabledById_fkey" FOREIGN KEY ("botDisabledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadAttachment" ADD CONSTRAINT "LeadAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotDelivery" ADD CONSTRAINT "BotDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

