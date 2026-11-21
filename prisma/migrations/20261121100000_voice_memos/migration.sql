-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "voiceMemoId" TEXT;

-- AlterTable
ALTER TABLE "MessagingSettings" ADD COLUMN     "firstReplyVoiceMemoId" TEXT;

-- CreateTable
CREATE TABLE "VoiceMemo" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "waMediaId" TEXT,
    "waMediaUploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoiceMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoiceMemoSend" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "voiceMemoId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "VoiceMemoSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VoiceMemoSend_dedupeKey_key" ON "VoiceMemoSend"("dedupeKey");

-- CreateIndex
CREATE INDEX "VoiceMemoSend_status_idx" ON "VoiceMemoSend"("status");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_voiceMemoId_fkey" FOREIGN KEY ("voiceMemoId") REFERENCES "VoiceMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingSettings" ADD CONSTRAINT "MessagingSettings_firstReplyVoiceMemoId_fkey" FOREIGN KEY ("firstReplyVoiceMemoId") REFERENCES "VoiceMemo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceMemoSend" ADD CONSTRAINT "VoiceMemoSend_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceMemoSend" ADD CONSTRAINT "VoiceMemoSend_voiceMemoId_fkey" FOREIGN KEY ("voiceMemoId") REFERENCES "VoiceMemo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

