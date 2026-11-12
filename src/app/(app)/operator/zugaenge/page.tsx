import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { ConsentCard } from "../consent-card";
import { IntegrationsCard } from "../integrations-card";

export const metadata: Metadata = { title: "Zugänge" };

/** Operator only: access data of TeamUp, WhatsApp and Meta. */
export default async function OperatorAccessPage() {
  await requireOperator();
  return (
    <>
      <PageHeader
        title="Zugänge"
        description="Schlüssel und Verbindungen zu TeamUp, WhatsApp und Meta – nur für dich als Betreiber sichtbar."
      />
      <IntegrationsCard />
      <ConsentCard />
    </>
  );
}
