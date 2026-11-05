-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "commissionBps" INTEGER,
    "vatBps" INTEGER,
    "paymentDays" INTEGER,
    "issuerName" TEXT,
    "issuerAddress" TEXT,
    "issuerTaxId" TEXT,
    "issuerIban" TEXT,
    "issuerEmail" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

