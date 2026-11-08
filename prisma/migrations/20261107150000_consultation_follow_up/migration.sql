-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "followUpAt" TIMESTAMP(3),
ADD COLUMN     "followUpDoneAt" TIMESTAMP(3),
ADD COLUMN     "followUpNotifiedAt" TIMESTAMP(3);

