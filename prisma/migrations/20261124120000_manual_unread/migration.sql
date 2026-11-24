-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "pushManualMessages" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "manualUnreadAt" TIMESTAMP(3);

