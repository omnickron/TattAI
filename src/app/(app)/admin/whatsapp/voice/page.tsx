import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, PageHeader, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { loadMessagingSettings } from "@/lib/whatsapp/messaging";
import { ActionButton } from "../../billing/buttons";
import { WhatsAppTabs } from "../tabs";
import { deleteVoiceMemo, setFirstReplyVoiceMemo } from "./actions";
import { VoiceMemoUploader } from "./uploader";

export const metadata: Metadata = { title: "Sprachnachrichten" };

const duration = (s: number | null) =>
  s === null ? null : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} Min.`;

/** Voice memos: upload, play, choose the one sent after a customer's first reply. */
export default async function VoiceMemosPage() {
  await requireAdmin();
  const [memos, settings, sent] = await Promise.all([
    prisma.voiceMemo.findMany({ orderBy: { createdAt: "desc" } }),
    loadMessagingSettings(prisma),
    prisma.message.groupBy({
      by: ["voiceMemoId"],
      where: { voiceMemoId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const sentCount = new Map(sent.map((s) => [s.voiceMemoId, s._count._all]));

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Sprachnachrichten wirken persönlicher als Text. WhatsApp erlaubt sie nur innerhalb von 24 Stunden, nachdem der Kunde geschrieben hat – als allererste Nachricht geht nur eine Vorlage."
      />
      <WhatsAppTabs active="voice" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Automatisch nach der ersten Antwort</CardTitle>
          <p className="mb-3 text-sm text-ink-soft">
            Antwortet ein Kunde zum ersten Mal, geht diese Sprachnachricht innerhalb von etwa 30
            Sekunden raus – vor der Antwort des Bots. Jeder Kunde bekommt sie nur einmal.
          </p>
          <ActionForm action={setFirstReplyVoiceMemo}>
            <Select
              name="voiceMemoId"
              defaultValue={settings.firstReplyVoiceMemoId ?? ""}
              aria-label="Sprachnachricht nach der ersten Antwort"
            >
              <option value="">Keine (aus)</option>
              {memos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Button type="submit">Speichern</Button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle>Neue Sprachnachricht</CardTitle>
          <p className="mb-3 text-sm text-ink-soft">
            Einfach mit dem Handy aufnehmen und hochladen. NEEDL wandelt sie in das Format um, das
            WhatsApp als Sprachnachricht anzeigt. Kurz halten: 15–40 Sekunden wirken am besten.
          </p>
          <VoiceMemoUploader />
        </Card>

        <Card className="lg:col-span-2">
          <CardTitle>Eure Sprachnachrichten</CardTitle>
          {memos.length === 0 ? (
            <p className="text-sm text-ink-soft">Noch keine Sprachnachricht hochgeladen.</p>
          ) : (
            <ul className="divide-y divide-line">
              {memos.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-40 flex-1">
                    <span className="block font-medium">
                      {m.name}{" "}
                      {settings.firstReplyVoiceMemoId === m.id && (
                        <Badge tone="green">nach erster Antwort</Badge>
                      )}
                    </span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        duration(m.durationSeconds),
                        `hochgeladen ${formatDateTime(m.createdAt)}`,
                        `${sentCount.get(m.id) ?? 0}× verschickt`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <audio
                    controls
                    preload="none"
                    src={`/api/voice-memos/${m.id}`}
                    className="h-9 max-w-full"
                  />
                  <ActionButton
                    action={deleteVoiceMemo.bind(null, m.id)}
                    variant="danger"
                    confirm={`„${m.name}“ löschen? Bereits verschickte bleiben beim Kunden.`}
                  >
                    Löschen
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Von Hand verschicken: im Chat eines Kontakts unter „Sprachnachricht senden“, solange das
            24-Stunden-Fenster offen ist.
          </p>
        </Card>
      </div>
    </>
  );
}
