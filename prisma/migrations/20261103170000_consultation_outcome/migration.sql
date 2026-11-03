-- CreateEnum
CREATE TYPE "SessionPlan" AS ENUM ('SINGLE', 'MULTIPLE');

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "furtherSessionsScheduled" BOOLEAN,
ADD COLUMN     "outcomeRecordedAt" TIMESTAMP(3),
ADD COLUMN     "outcomeRecordedById" TEXT,
ADD COLUMN     "sessionPlan" "SessionPlan";

-- AlterTable
ALTER TABLE "TattooBooking" ADD COLUMN     "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionNumber" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "amountCents" DROP NOT NULL;


-- Existing tattoo bookings (sample data) were single sessions.
UPDATE "Consultation" SET "sessionPlan" = 'SINGLE' WHERE "tattooBooked" = true AND "sessionPlan" IS NULL;
