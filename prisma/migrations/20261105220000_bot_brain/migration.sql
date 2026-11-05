-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "botHandoverNote" TEXT,
ADD COLUMN     "botMemory" TEXT;

-- CreateTable
CREATE TABLE "BotTurn" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,
    "mode" TEXT,
    "reply" TEXT,
    "log" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotTurn_leadId_createdAt_idx" ON "BotTurn"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "BotTurn_createdAt_idx" ON "BotTurn"("createdAt");

-- AddForeignKey
ALTER TABLE "BotTurn" ADD CONSTRAINT "BotTurn_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

