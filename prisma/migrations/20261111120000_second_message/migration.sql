-- AlterEnum
ALTER TYPE "OutboundKind" ADD VALUE 'SECOND_MESSAGE';

-- AlterTable
ALTER TABLE "MessagingSettings" ADD COLUMN     "firstContactImmediate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "quietHoursStart" TEXT NOT NULL DEFAULT '21:00',
ADD COLUMN     "secondMessageMinDelayMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "secondMessageTemplateId" TEXT;

