import { Badge, Card, CardTitle, cn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { MESSAGE_STATUS_LABELS, OUTBOUND_KIND_LABELS } from "@/lib/whatsapp/labels";
import { replyWindow } from "@/lib/whatsapp/replies";
import { sendReplyAction } from "./actions";
import { ReplyForm } from "./reply-form";
import { BotToggle } from "./bot-toggle";
import { setBotEnabledAction } from "./actions";
import { BOT_REASON_LABELS, type BotDisabledReason } from "@/lib/bot/state";

type ChatMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  templateName: string | null;
  status: string | null;
  errorCode: number | null;
  sentAt: Date;
  sentBy: { name: string } | null;
  sentByBot: boolean;
};

type Planned = {
  id: string;
  kind: "FIRST_CONTACT" | "SECOND_MESSAGE" | "FOLLOW_UP" | "REMINDER" | "AFTER_CONSULTATION";
  status: "QUEUED" | "SENT" | "FAILED" | "CANCELLED";
  step: number;
  notBefore: Date;
  lastError: string | null;
  template: { name: string };
};

export function ChatSection({
  leadId,
  messages: latestFirst,
  planned,
  optOut,
  consent,
  lastInboundAt,
  hasPhone,
  sendingPaused,
  bot,
}: {
  bot: {
    enabled: boolean;
    globallyEnabled: boolean;
    disabledAt: Date | null;
    disabledReason: string | null;
    handoverNote?: string | null;
    disabledBy: string | null;
  };
  leadId: string;
  hasPhone: boolean;
  sendingPaused: boolean;
  messages: ChatMessage[];
  planned: Planned[];
  optOut: boolean;
  consent: boolean;
  lastInboundAt: Date | null;
}) {
  const messages = [...latestFirst].reverse();
  const reply = replyWindow(lastInboundAt, new Date());
  const windowOpen = reply.open;
  return (
    <Card id="chat" className="scroll-mt-24">
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
        <BotToggle
          enabled={bot.enabled}
          action={setBotEnabledAction.bind(null, leadId, !bot.enabled)}
        />
        <p className="text-xs text-ink-soft">
          {!bot.globallyEnabled
            ? "Der Bot ist für alle Chats ausgeschaltet (WhatsApp-Einstellungen)."
            : bot.enabled
              ? "Der Bot beantwortet Nachrichten in diesem Chat."
              : `${BOT_REASON_LABELS[(bot.disabledReason ?? "MANUAL") as BotDisabledReason]}${
                  bot.disabledBy ? ` von ${bot.disabledBy}` : ""
                }${bot.disabledAt ? ` am ${formatDateTime(bot.disabledAt)}` : ""}.`}
          {!bot.enabled && bot.disabledReason === "BOT_HANDOVER" && bot.handoverNote && (
            <span className="block font-medium text-ink">Grund: {bot.handoverNote}</span>
          )}
        </p>
      </div>
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
                {m.direction === "OUTBOUND" &&
                  (m.sentBy ? ` · ${m.sentBy.name}` : m.sentByBot ? " · Bot" : " · automatisch")}
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
      <div className="mt-4 border-t border-line pt-3">
        {!hasPhone ? (
          <p className="text-sm text-ink-soft">
            Keine gültige WhatsApp-Nummer – Antworten nicht möglich.
          </p>
        ) : optOut ? (
          <p className="text-sm text-ink-soft">
            Der Kunde hat sich abgemeldet (Opt-out). Bitte nicht mehr per WhatsApp schreiben.
          </p>
        ) : windowOpen ? (
          <>
            <p className="mb-2 text-xs text-ink-soft">
              Freie Antworten sind bis {formatDateTime(reply.closesAt)} möglich (24 Stunden nach der
              letzten Nachricht des Kunden).
              {sendingPaused && " Hinweis: Der automatische Versand ist gerade pausiert."}
            </p>
            {bot.enabled && (
              <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                Wenn du antwortest, übernimmst du den Chat – der Bot schaltet sich hier ab.
              </p>
            )}
            <ReplyForm action={sendReplyAction.bind(null, leadId)} />
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            {lastInboundAt
              ? `Das 24-Stunden-Fenster ist seit ${formatDateTime(reply.closesAt)} geschlossen.`
              : "Der Kunde hat noch nicht geschrieben."}{" "}
            WhatsApp erlaubt freie Nachrichten erst wieder, wenn der Kunde schreibt.
          </p>
        )}
      </div>

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
                  {p.kind === "AFTER_CONSULTATION" && ` (${p.step} h danach)`}
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
