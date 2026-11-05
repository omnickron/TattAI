import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { BillingCard } from "./billing-card";
import { OperationsCard } from "./operations-card";

export const metadata: Metadata = { title: "Betreiber" };

/** Only for the NEEDL operator: bot operation and costs, billing details. */
export default async function OperatorPage() {
  await requireOperator();
  return (
    <>
      <PageHeader
        title="Betreiber"
        description="Nur für dich als Betreiber von NEEDL sichtbar – das Studio sieht diese Seite nicht."
      />
      <OperationsCard />
      <BillingCard />
    </>
  );
}
