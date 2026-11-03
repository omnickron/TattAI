import { formatDateTime } from "@/lib/format";
import { summaryLines } from "@/lib/scheduling/event-content";

type Attachment = {
  id: string;
  status: string;
  mimeType: string | null;
  caption: string | null;
  createdAt: Date;
};

export function TattooIdea({
  summary,
  attachments,
}: {
  summary: unknown;
  attachments: Attachment[];
}) {
  const lines = summaryLines(summary).filter((l) => !l.startsWith("Referenzbilder"));
  const updatedAt =
    summary && typeof summary === "object" && "updatedAt" in summary
      ? new Date(String(summary.updatedAt))
      : null;
  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <p className="text-sm text-ink-soft">
          Noch keine Zusammenfassung – der Chatbot liefert sie nach dem Gespräch.
        </p>
      ) : (
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
          {lines.map((line) => {
            const [label, ...rest] = line.split(": ");
            return (
              <div key={label} className="contents">
                <dt className="text-ink-soft">{label}</dt>
                <dd className="whitespace-pre-wrap">{rest.join(": ")}</dd>
              </div>
            );
          })}
        </dl>
      )}
      {updatedAt && !Number.isNaN(updatedAt.getTime()) && (
        <p className="text-xs text-ink-soft">Zuletzt aktualisiert {formatDateTime(updatedAt)}</p>
      )}
      {attachments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Referenzbilder und Dateien</h3>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {attachments.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-lg border border-line bg-muted">
                {a.status !== "STORED" ? (
                  <div className="flex aspect-square items-center justify-center p-2 text-center text-xs text-ink-soft">
                    wird geladen …
                  </div>
                ) : a.mimeType?.startsWith("image/") && a.mimeType !== "image/heic" ? (
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-protected file */}
                    <img
                      src={`/api/attachments/${a.id}`}
                      alt={a.caption ?? "Referenzbild"}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <a
                    href={`/api/attachments/${a.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex aspect-square items-center justify-center p-2 text-center text-xs underline"
                  >
                    {a.mimeType === "application/pdf" ? "PDF öffnen" : "Datei öffnen"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
