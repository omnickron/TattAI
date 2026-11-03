-- AlterTable
ALTER TABLE "TattooBooking" ADD COLUMN     "calendarNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "calendarSyncAttempts" INTEGER NOT NULL DEFAULT 0;

