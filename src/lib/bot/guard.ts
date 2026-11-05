/**
 * Safety nets before every bot run: pause switch, cost brake (day/month), reply limits
 * per customer and across all chats, and the automatic pause after repeated errors.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { activeAdminIds, pushToUsers, type PushSender } from "../push";
import { DEFAULT_TIME_ZONE, localDateOf, startOfLocalDay } from "../time";
import { formatEuro, microsToCents } from "./costs";

export const BOT_SETTINGS_DEFAULTS = {
  maxPerHourPerLead: 30,
  maxPerDayPerLead: 80,
  maxPerDayTotal: 1500,
  dailyBudgetCents: 500,
  monthlyBudgetCents: 10000,
};
/** This many failed runs within the window pause the bot for all chats. */
export const ERROR_PAUSE_COUNT = 5;
export const ERROR_WINDOW_MS = 30 * 60_000;
const HOUR = 3600_000;

type Db = Pick<PrismaClient, "botSettings" | "botTurn" | "message" | "user" | "pushSubscription">;

export async function loadBotSettings(prisma: Pick<PrismaClient, "botSettings">) {
  return (
    (await prisma.botSettings.findUnique({ where: { id: 1 } })) ?? {
      id: 1,
      ...BOT_SETTINGS_DEFAULTS,
      pausedAt: null,
      pausedReason: null,
      lastAlertKey: null,
      updatedAt: new Date(0),
    }
  );
}

/** Bot spend (micro-dollars) since the start of today and of this month. */
export async function botSpend(
  prisma: Pick<PrismaClient, "botTurn">,
  now: Date,
  tz = DEFAULT_TIME_ZONE,
) {
  const today = localDateOf(now, tz);
  const dayStart = startOfLocalDay(today, tz);
  const monthStart = startOfLocalDay(`${today.slice(0, 7)}-01`, tz);
  const [day, month] = await Promise.all([
    prisma.botTurn.aggregate({
      where: { createdAt: { gte: dayStart } },
      _sum: { costMicros: true },
    }),
    prisma.botTurn.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { costMicros: true },
    }),
  ]);
  return {
    today,
    dayMicros: day._sum.costMicros ?? 0,
    monthMicros: month._sum.costMicros ?? 0,
    dayStart,
  };
}

export type GuardResult =
  | { ok: true }
  /** Only this chat is affected (customer limit) */
  | { ok: false; scope: "lead"; reason: string }
  /** The bot may not answer anywhere right now */
  | { ok: false; scope: "global"; reason: string; alertKey: string };

export async function checkGuard(
  prisma: Db,
  leadId: string,
  now: Date,
  tz = DEFAULT_TIME_ZONE,
): Promise<GuardResult> {
  const s = await loadBotSettings(prisma);
  if (s.pausedAt)
    return {
      ok: false,
      scope: "global",
      reason: `Bot pausiert: ${s.pausedReason ?? "von Hand"}`,
      alertKey: `paused:${s.pausedAt.toISOString()}`,
    };

  const spend = await botSpend(prisma, now, tz);
  if (microsToCents(spend.dayMicros) >= s.dailyBudgetCents)
    return {
      ok: false,
      scope: "global",
      reason: `Tageslimit der Bot-Kosten erreicht (${formatEuro(s.dailyBudgetCents)}). Morgen geht es automatisch weiter.`,
      alertKey: `budget-day:${spend.today}`,
    };
  if (microsToCents(spend.monthMicros) >= s.monthlyBudgetCents)
    return {
      ok: false,
      scope: "global",
      reason: `Monatslimit der Bot-Kosten erreicht (${formatEuro(s.monthlyBudgetCents)}).`,
      alertKey: `budget-month:${spend.today.slice(0, 7)}`,
    };

  const bot = { sentByBot: true, direction: "OUTBOUND" as const };
  const [total, perHour, perDay] = await Promise.all([
    prisma.message.count({ where: { ...bot, sentAt: { gte: spend.dayStart } } }),
    prisma.message.count({
      where: { ...bot, leadId, sentAt: { gte: new Date(now.getTime() - HOUR) } },
    }),
    prisma.message.count({ where: { ...bot, leadId, sentAt: { gte: spend.dayStart } } }),
  ]);
  if (total >= s.maxPerDayTotal)
    return {
      ok: false,
      scope: "global",
      reason: `Tageslimit von ${s.maxPerDayTotal} Bot-Antworten für alle Chats erreicht.`,
      alertKey: `total-day:${spend.today}`,
    };
  if (perHour >= s.maxPerHourPerLead)
    return {
      ok: false,
      scope: "lead",
      reason: `Mehr als ${s.maxPerHourPerLead} Bot-Antworten in einer Stunde in diesem Chat – bitte selbst schauen.`,
    };
  if (perDay >= s.maxPerDayPerLead)
    return {
      ok: false,
      scope: "lead",
      reason: `Mehr als ${s.maxPerDayPerLead} Bot-Antworten heute in diesem Chat – bitte selbst schauen.`,
    };
  return { ok: true };
}

/** Pushes an alert to the admins once per key (e.g. once per day for the daily budget). */
export async function alertAdminsOnce(
  prisma: Db,
  push: PushSender | undefined,
  key: string,
  body: string,
) {
  const s = await loadBotSettings(prisma);
  if (s.lastAlertKey === key) return false;
  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: { lastAlertKey: key },
    create: { id: 1, lastAlertKey: key },
  });
  if (push)
    await pushToUsers(prisma, push, await activeAdminIds(prisma), {
      title: "NEEDL-Bot",
      body: body.slice(0, 160),
      url: "/admin/bot",
      tag: "bot-alert",
    });
  return true;
}

/** After a failed run: pause the bot for all chats when errors pile up. */
export async function pauseOnRepeatedErrors(prisma: Db, push: PushSender | undefined, now: Date) {
  const errors = await prisma.botTurn.count({
    where: { outcome: "error", createdAt: { gte: new Date(now.getTime() - ERROR_WINDOW_MS) } },
  });
  if (errors < ERROR_PAUSE_COUNT) return false;
  const s = await loadBotSettings(prisma);
  if (s.pausedAt) return false;
  const reason = `${errors} Fehler in 30 Minuten (z. B. Anthropic nicht erreichbar oder API-Key ungültig).`;
  await prisma.botSettings.upsert({
    where: { id: 1 },
    update: { pausedAt: now, pausedReason: reason },
    create: { id: 1, pausedAt: now, pausedReason: reason },
  });
  await alertAdminsOnce(
    prisma,
    push,
    `paused:${now.toISOString()}`,
    `Bot pausiert: ${reason} Neue Nachrichten gehen an euch.`,
  );
  return true;
}
