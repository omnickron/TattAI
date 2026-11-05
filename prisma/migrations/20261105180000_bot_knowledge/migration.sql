-- CreateTable
CREATE TABLE "BotKnowledge" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "assistantName" TEXT,
    "about" TEXT,
    "team" TEXT,
    "location" TEXT,
    "openingHours" TEXT,
    "services" TEXT,
    "process" TEXT,
    "customerConcerns" TEXT,
    "toneExamples" TEXT,
    "forbiddenWords" TEXT,
    "noGos" TEXT,
    "links" JSONB,
    "faq" JSONB,
    "objections" JSONB,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotKnowledge_pkey" PRIMARY KEY ("id")
);

