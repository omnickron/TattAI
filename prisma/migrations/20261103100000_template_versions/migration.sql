-- AlterTable
ALTER TABLE "WhatsAppTemplate" ADD COLUMN     "approvedName" TEXT,
ADD COLUMN     "submissionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "submittedName" TEXT,
ADD COLUMN     "submittedText" TEXT;

