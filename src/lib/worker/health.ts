/**
 * Sign of life of the background worker. The worker writes one row after every run;
 * the operator sees a warning when it stays away (worker down, crashing or stuck) or
 * when single jobs fail.
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/** No complete run for this long = something is wrong (a run normally comes every 30 s). */
export const WORKER_STALE_MS = 5 * 60_000;

export type WorkerFailure = { job: string; message: string };

/** German names of the worker jobs, for the operator. */
export const JOB_LABELS: Record<string, string> = {
  settings: "Zugänge laden",
  messaging: "WhatsApp-Versand",
  botInbox: "Bot-Antworten",
  botEvents: "Bot-Schnittstelle",
  calendar: "Kalender-Abgleich",
  media: "Bilder herunterladen",
  followUps: "Wiedervorlagen",
  outcomes: "Erinnerung an Ergebnisse",
  retention: "Löschfristen",
  leadRetry: "Meta-Leads nachladen",
  evalStart: "Bot-Test starten",
};

type Db = Pick<PrismaClient, "workerHeartbeat">;

export async function recordWorkerStart(prisma: Db, now = new Date()) {
  await prisma.workerHeartbeat.upsert({
    where: { id: 1 },
    create: { id: 1, startedAt: now, startCount: 1 },
    update: { startedAt: now, startCount: { increment: 1 } },
  });
}

export async function recordWorkerTick(
  prisma: Db,
  tickMs: number,
  failures: WorkerFailure[],
  now = new Date(),
) {
  const data = {
    lastTickAt: now,
    tickMs,
    failures: failures.map((f) => ({
      job: f.job,
      message: f.message.slice(0, 300),
    })) as unknown as Prisma.InputJsonValue,
  };
  await prisma.workerHeartbeat.upsert({
    where: { id: 1 },
    create: { id: 1, ...data },
    update: data,
  });
}

export async function recordWorkerCrash(prisma: Db, err: unknown, now = new Date()) {
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
  await prisma.workerHeartbeat.upsert({
    where: { id: 1 },
    create: { id: 1, crashedAt: now, crashError: message },
    update: { crashedAt: now, crashError: message },
  });
}

export type WorkerHealth =
  | { state: "never" }
  | { state: "stale"; lastTickAt: Date | null; startedAt: Date | null; crash: Crash | null }
  | { state: "failing"; lastTickAt: Date; failures: WorkerFailure[] }
  | { state: "ok"; lastTickAt: Date };
type Crash = { at: Date; message: string };

type Row = {
  startedAt: Date | null;
  lastTickAt: Date | null;
  failures: unknown;
  crashedAt: Date | null;
  crashError: string | null;
} | null;

/** Evaluates the stored sign of life at `now`. */
export function workerHealth(row: Row, now = new Date()): WorkerHealth {
  if (!row || (!row.lastTickAt && !row.startedAt)) return { state: "never" };
  const fresh = row.lastTickAt && now.getTime() - row.lastTickAt.getTime() <= WORKER_STALE_MS;
  if (!fresh) {
    // A crash only explains the outage if it happened after the last good run
    const crash =
      row.crashedAt && row.crashError && (!row.lastTickAt || row.crashedAt >= row.lastTickAt)
        ? { at: row.crashedAt, message: row.crashError }
        : null;
    return { state: "stale", lastTickAt: row.lastTickAt, startedAt: row.startedAt, crash };
  }
  const failures = Array.isArray(row.failures) ? (row.failures as WorkerFailure[]) : [];
  return failures.length
    ? { state: "failing", lastTickAt: row.lastTickAt!, failures }
    : { state: "ok", lastTickAt: row.lastTickAt! };
}

export async function loadWorkerHealth(prisma: Db, now = new Date()) {
  return workerHealth(await prisma.workerHeartbeat.findUnique({ where: { id: 1 } }), now);
}
