-- CreateEnum
CREATE TYPE "SessionAttendance" AS ENUM ('ATTENDED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "TattooBooking" ADD COLUMN     "attendance" "SessionAttendance",
ADD COLUMN     "attendanceRecordedAt" TIMESTAMP(3),
ADD COLUMN     "depositCents" INTEGER,
ADD COLUMN     "finalAmountCents" INTEGER;

