-- CreateTable
CREATE TABLE "BotEvalRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "model" TEXT,
    "requestedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "avgGrade" INTEGER,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "results" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotEvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotEvalRun_createdAt_idx" ON "BotEvalRun"("createdAt");

