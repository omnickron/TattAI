-- AlterTable
ALTER TABLE "TattooBooking" ADD COLUMN     "calendarEventId" TEXT,
ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "calendarSyncError" TEXT,
ADD COLUMN     "calendarSyncPending" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "calendarSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CalendarEventDeletion" (
    "id" TEXT NOT NULL,
    "tattooerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEventDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventDeletion_calendarId_eventId_key" ON "CalendarEventDeletion"("calendarId", "eventId");

-- CreateIndex
CREATE INDEX "TattooBooking_calendarSyncPending_idx" ON "TattooBooking"("calendarSyncPending");

