import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireOperator } from "@/lib/auth/session";
import { EvalCard } from "../eval-card";
import { OperationsCard } from "../operations-card";
import { WorkerStatus } from "../worker-status";

export const metadata: Metadata = { title: "Bot-Betrieb" };

/** Operator only: bot operation, costs, limits and bot tests. */
export default async function OperatorBotPage() {
  await requireOperator();
  return (
    <>
      <PageHeader
        title="Bot-Betrieb"
        description="Kosten, Limits, Fehler und Bot-Tests – nur für dich als Betreiber sichtbar."
      />
      <WorkerStatus showOk />
      <OperationsCard />
      <EvalCard />
    </>
  );
}
