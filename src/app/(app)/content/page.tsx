import type { Metadata } from "next";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Content"
        description="Lade Fotos und Videos deiner Arbeiten hoch – daraus erstellen wir später neue Meta-Anzeigen."
      />
      <Card>
        <CardTitle action={<Badge tone="gray">in Vorbereitung</Badge>}>Bald verfügbar</CardTitle>
        <ul className="list-inside list-disc space-y-1.5 text-sm text-ink-soft">
          <li>Fotos und Videos hochladen, direkt vom Handy</li>
          <li>Kurze Beschreibung: Motiv, Stil, Körperstelle</li>
          <li>Bestätigung, dass der Kunde mit der Verwendung in Werbung einverstanden ist</li>
          <li>Übersicht für den Admin, um passende Inhalte für neue Anzeigen auszuwählen</li>
        </ul>
      </Card>
    </>
  );
}
