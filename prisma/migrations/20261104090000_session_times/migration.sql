-- AlterTable
ALTER TABLE "TattooBooking" ADD COLUMN     "endsAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "TattooBooking_startsAt_idx" ON "TattooBooking"("startsAt");

