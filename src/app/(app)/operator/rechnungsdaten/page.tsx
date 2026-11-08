import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { BillingCard } from "../billing-card";

export const metadata: Metadata = { title: "Rechnungsdaten" };

/** Operator only: commission, tax and sender details of the invoices. */
export default async function OperatorBillingPage() {
  await requireOperator();
  return (
    <>
      <PageHeader
        title="Rechnungsdaten"
        description="Provision, Steuer und Absender deiner Rechnungen an das Studio. Rechnungen erstellst du unter Studio → Abrechnung."
      />
      <BillingCard />
    </>
  );
}
