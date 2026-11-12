-- DropForeignKey
ALTER TABLE "OutboundMessage" DROP CONSTRAINT "OutboundMessage_templateId_fkey";

-- AlterTable
ALTER TABLE "OutboundMessage" ALTER COLUMN "templateId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "WhatsAppTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

