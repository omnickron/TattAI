-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "consultationFree" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "consultationOnSite" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "consultationPhone" BOOLEAN NOT NULL DEFAULT true;

