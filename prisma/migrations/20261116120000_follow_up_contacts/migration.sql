-- CreateEnum
CREATE TYPE "FollowUpResult" AS ENUM ('TATTOO', 'NO_TATTOO', 'AGAIN');

-- CreateTable
CREATE TABLE "FollowUpContact" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reached" BOOLEAN NOT NULL,
    "result" "FollowUpResult" NOT NULL,
    "note" TEXT,
    "nextAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpContact_consultationId_idx" ON "FollowUpContact"("consultationId");

-- AddForeignKey
ALTER TABLE "FollowUpContact" ADD CONSTRAINT "FollowUpContact_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

