-- CreateEnum
CREATE TYPE "ConsultationMode" AS ENUM ('ON_SITE', 'PHONE');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "studioAddress" TEXT;

-- AlterTable
ALTER TABLE "AvailabilityRule" ALTER COLUMN "validFrom" SET DATA TYPE DATE,
ALTER COLUMN "validUntil" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "calendarId" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "mode" "ConsultationMode" NOT NULL DEFAULT 'ON_SITE';

-- Database-level guarantee against double bookings: no two non-cancelled
-- consultations of the same tattooer may overlap in time.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Consultation"
  ADD CONSTRAINT "Consultation_no_overlap"
  EXCLUDE USING gist ("tattooerId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE (status <> 'CANCELLED');
