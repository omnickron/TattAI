-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "selectedForAd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentItem_storagePath_key" ON "ContentItem"("storagePath");

-- CreateIndex
CREATE INDEX "ContentItem_uploaderId_createdAt_idx" ON "ContentItem"("uploaderId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentItem_createdAt_idx" ON "ContentItem"("createdAt");

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

