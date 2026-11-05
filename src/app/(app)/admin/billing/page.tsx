import type { Metadata } from "next";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Abrechnung" };

export default async function BillingPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader title="Abrechnung" description="Zahlungen und Abrechnungen des Studios." />
      <Card>
        <CardTitle action={<Badge tone="gray">in Vorbereitung</Badge>}>Bald verfügbar</CardTitle>
        <p className="text-sm text-ink-soft">
          Hier entsteht die Übersicht über Zahlungen und Abrechnungen.
        </p>
      </Card>
    </>
  );
}
