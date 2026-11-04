-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'TEAMUP');

-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "teamupArtistFieldId" TEXT,
ADD COLUMN     "teamupArtistFieldName" TEXT,
ADD COLUMN     "teamupSubcalendarId" TEXT,
ADD COLUMN     "teamupSubcalendarName" TEXT;

-- AlterTable
ALTER TABLE "TattooerProfile" ADD COLUMN     "calendarProvider" "CalendarProvider" NOT NULL DEFAULT 'GOOGLE',
ADD COLUMN     "googleCalendarId" TEXT,
ADD COLUMN     "teamupArtist" TEXT,
ADD COLUMN     "teamupArtistLabel" TEXT,
ADD COLUMN     "teamupConnectedAt" TIMESTAMP(3);

