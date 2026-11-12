-- CreateTable
CREATE TABLE "WorkerHeartbeat" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "startCount" INTEGER NOT NULL DEFAULT 0,
    "lastTickAt" TIMESTAMP(3),
    "tickMs" INTEGER,
    "failures" JSONB,
    "crashedAt" TIMESTAMP(3),
    "crashError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

