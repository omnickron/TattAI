-- AlterTable
ALTER TABLE "MessagingSettings" ADD COLUMN     "lastWorkerRunAt" TIMESTAMP(3),
ADD COLUMN     "workerLeaseUntil" TIMESTAMP(3);

