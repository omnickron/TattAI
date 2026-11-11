-- Variable number of opening messages instead of a fixed "second message"
ALTER TYPE "OutboundKind" RENAME VALUE 'SECOND_MESSAGE' TO 'INTRO_MESSAGE';

-- CreateTable
CREATE TABLE "IntroStep" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "templateId" TEXT NOT NULL,
    "minDelayMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntroStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntroStep_position_key" ON "IntroStep"("position");

-- AddForeignKey
ALTER TABLE "IntroStep" ADD CONSTRAINT "IntroStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A configured second message becomes intro step 2
INSERT INTO "IntroStep" ("id", "position", "templateId", "minDelayMinutes")
SELECT 'intro-2', 2, "secondMessageTemplateId", "secondMessageMinDelayMinutes"
FROM "MessagingSettings" WHERE "id" = 1 AND "secondMessageTemplateId" IS NOT NULL;

-- Existing planned second messages get their position
UPDATE "OutboundMessage" SET "step" = 2 WHERE "kind" = 'INTRO_MESSAGE';

-- AlterTable
ALTER TABLE "MessagingSettings" DROP COLUMN "secondMessageMinDelayMinutes",
DROP COLUMN "secondMessageTemplateId",
ADD COLUMN     "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true;
