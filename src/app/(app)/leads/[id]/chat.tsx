import { Badge, Card, CardTitle, cn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { MESSAGE_STATUS_LABELS, OUTBOUND_KIND_LABELS } from "@/lib/whatsapp/labels";

type ChatMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  templateName: string | null;
  status: string | null;
  errorCode: number | null;
  sentAt: Date;
};

type Planned = {
  id: string;
  kind: "FIRST_CONTACT" | "FOLLOW_UP" | "REMINDER";
  status: "QUEUED" | "SENT" | "FAILED" | "CANCELLED";
  step: number;
  notBefore: Date;
  lastError: string | null;
  template: { name: string };
};

export function ChatSection({
  messages,
  planned,
  optOut,
  consent,
  lastInboundAt,
}: {
  messages: ChatMessage[];
  planned: Planned[];
  optOut: boolean;
  consent: boolean;
  lastInboundAt: Date | null;
}) {
  const now = new Date();
  const windowOpen = lastInboundAt && now.getTime() - lastInboundAt.getTime() < 24 * 3600_000;
  return (
    <Card>
      <CardTitle
        action={
          optOut ? (
            <Badge tone="red">Opt-out</Badge>
          ) : !consent ? (
            <Badge tone="amber">ohne Einwilligung</Badge>
          ) : windowOpen ? (
            <Badge tone="green">24-h-Fenster offen</Badge>
          ) : undefined
        }
      >
        Chatverlauf
      </CardTitle>
      {messages.length === 0 ? (
        <p className="text-sm text-ink-soft">Noch keine Nachrichten.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg p-2",
                m.direction === "INBOUND" ? "mr-auto bg-muted" : "ml-auto bg-ink text-paper",
              )}
            >
              {m.body ?? `[${m.templateName ?? "Nachricht"}]`}
              <span className="mt-1 block text-[11px] opacity-70">
                {formatDateTime(m.sentAt)}
                {m.direction === "OUTBOUND" && m.templateName && ` · ${m.templateName}`}
                {m.direction === "OUTBOUND" &&
                  m.status &&
                  ` · ${MESSAGE_STATUS_LABELS[m.status] ?? m.status}`}
                {m.errorCode && ` (Fehler ${m.errorCode})`}
              </span>
            </li>
          ))}
        </ul>
      )}
      {planned.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Automatische Nachrichten
          </h3>
          <ul className="space-y-1 text-sm">
            {planned.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <Badge tone={p.status === "FAILED" ? "red" : "blue"}>
                  {p.status === "FAILED" ? "fehlgeschlagen" : "geplant"}
                </Badge>
                <span>
                  {OUTBOUND_KIND_LABELS[p.kind]}
                  {p.kind === "FOLLOW_UP" && ` ${p.step}`}
                  {p.kind === "REMINDER" && ` (${p.step} h vorher)`}
                </span>
                <span className="text-xs text-ink-soft">
                  {p.status === "FAILED"
                    ? p.lastError
                    : `frühestens ${formatDateTime(p.notBefore)}, zur nächsten Sendezeit`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
