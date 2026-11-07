import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { AdminsCard } from "./admins-card";
import { BillingCard } from "./billing-card";
import { EvalCard } from "./eval-card";
import { IntegrationsCard } from "./integrations-card";
import { OperationsCard } from "./operations-card";

export const metadata: Metadata = { title: "Betreiber" };

/** Only for the NEEDL operator: bot operation and costs, billing details. */
export default async function OperatorPage() {
  const user = await requireOperator();
  return (
    <>
      <PageHeader
        title="Betreiber"
        description="Nur für dich als Betreiber von NEEDL sichtbar – das Studio sieht diese Seite nicht."
      />
      <AdminsCard currentUserId={user.id} />
      <IntegrationsCard />
      <OperationsCard />
      <EvalCard />
      <BillingCard />
    </>
  );
}
