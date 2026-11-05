-- AlterTable
ALTER TABLE "BotTurn" ADD COLUMN     "costMicros" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "botHandoverAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BotSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maxPerHourPerLead" INTEGER NOT NULL DEFAULT 30,
    "maxPerDayPerLead" INTEGER NOT NULL DEFAULT 80,
    "maxPerDayTotal" INTEGER NOT NULL DEFAULT 1500,
    "dailyBudgetCents" INTEGER NOT NULL DEFAULT 500,
    "monthlyBudgetCents" INTEGER NOT NULL DEFAULT 10000,
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "lastAlertKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

