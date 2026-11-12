import Link from "next/link";
import { cn } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDateTime, formatRelative } from "@/lib/format";
import { JOB_LABELS, loadWorkerHealth } from "@/lib/worker/health";

const HELP =
  "Auf dem Server: docker compose ps (läuft der worker?) und docker compose logs --tail=50 worker. Lokal: npm run worker.";

/**
 * Operator only: warning when the background worker is down, crashing, stuck or has
 * failing jobs. `showOk` also shows a short line when everything is fine.
 */
export async function WorkerStatus({ showOk = false, link = false }) {
  const now = new Date();
  const health = await loadWorkerHealth(prisma, now);
  if (health.state === "ok") {
    if (!showOk) return null;
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
        <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
        Hintergrunddienst (Worker) läuft · letzte Meldung {formatRelative(health.lastTickAt, now)}
      </p>
    );
  }

  const red = health.state !== "failing";
  const title =
    health.state === "never"
      ? "Der Hintergrunddienst (Worker) hat sich noch nie gemeldet"
      : health.state === "stale"
        ? `Der Hintergrunddienst (Worker) läuft nicht${
            health.lastTickAt ? ` – letzte Meldung ${formatDateTime(health.lastTickAt)}` : ""
          }`
        : "Im Hintergrunddienst (Worker) schlagen Aufgaben fehl";

  return (
    <div
      role="alert"
      className={cn(
        "mb-4 rounded-xl border p-4 text-sm",
        red
          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
      )}
    >
      <p className="font-semibold">{title}</p>
      {health.state === "failing" ? (
        <ul className="mt-2 space-y-1">
          {health.failures.map((f, i) => (
            <li key={i}>
              <span className="font-medium">{JOB_LABELS[f.job] ?? f.job}:</span>{" "}
              <span className="break-words">{f.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="mt-1">
            Solange er steht, laufen keine WhatsApp-Nachrichten, keine Bot-Antworten, keine
            Kalender-Übertragung, keine Erinnerungen und keine Bot-Tests.
          </p>
          {health.state === "stale" && health.crash && (
            <p className="mt-2 break-words">
              Absturz {formatDateTime(health.crash.at)}: {health.crash.message}
            </p>
          )}
          {health.state === "stale" &&
            health.startedAt &&
            (!health.lastTickAt || health.startedAt > health.lastTickAt) && (
              <p className="mt-2">
                Zuletzt gestartet {formatDateTime(health.startedAt)} – er startet, kommt aber nicht
                durch (Absturz oder hängt).
              </p>
            )}
        </>
      )}
      <p className="mt-2 opacity-80">{HELP}</p>
      {link && (
        <Link href="/operator/bot" className="mt-2 inline-block font-medium underline">
          Zum Bot-Betrieb
        </Link>
      )}
    </div>
  );
}
