-- AlterTable
ALTER TABLE "MessagingSettings" ADD COLUMN     "botQuietEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "botQuietEnd" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "botQuietStart" TEXT NOT NULL DEFAULT '22:00',
ADD COLUMN     "botReplyDelayMaxSeconds" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "botReplyDelayMinSeconds" INTEGER NOT NULL DEFAULT 30;

