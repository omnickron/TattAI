/**
 * The built-in WhatsApp bot ("brain"): answers new customer messages with Claude,
 * using the studio knowledge, NEEDL's own booking functions as tools and hard
 * filters on every reply. One run = one answer to all new messages of a chat.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  MessageCreateParamsNonStreaming as BetaCreateParams,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_TIME_ZONE, startOfLocalDay, addDays, isLocalDate } from "../time";
import { checkReply, forbiddenWordList } from "./filters";
import { toKnowledge } from "./knowledge";
import { buildSystemPrompt, MAX_MEMORY_LENGTH } from "./prompt";
import {
  botBook,
  botCancel,
  botReschedule,
  botSaveTattooSummary,
  botSlots,
  toBotApiError,
  type BotDeps,
} from "./service";
import { botActiveFor, isBotGloballyEnabled, setBotEnabled } from "./state";
import { sendBotReply } from "../whatsapp/replies";

export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_ROUNDS = 8;
const MAX_REJECTIONS = 2;
const HISTORY_MESSAGES = 40;
export const HANDOVER_TEXT =
  "Danke dir! Ich gebe das kurz an unser Team weiter – es meldet sich so bald wie möglich jemand bei dir.";

/** The part of the Anthropic client the brain uses (replaced by a mock in tests). */
export interface BrainClient {
  create(params: BetaCreateParams): Promise<BetaMessage>;
}

export interface BrainConfig {
  model: string;
  effort: "low" | "medium" | "high";
  maxTokens: number;
}

export function brainConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BrainConfig {
  const effort = env.BOT_EFFORT === "medium" || env.BOT_EFFORT === "high" ? env.BOT_EFFORT : "low";
  return { model: env.BOT_MODEL?.trim() || "claude-opus-5-5", effort, maxTokens: 8000 };
}

/** Null when no Anthropic API key is configured (built-in bot off). */
export function createBrainClient(env: NodeJS.ProcessEnv = process.env): BrainClient | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return { create: (params) => client.beta.messages.create(params) };
}

export interface BrainDeps extends BotDeps {
  brain: BrainClient;
  config?: BrainConfig;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const nullableString = (description: string) => ({ type: ["string", "null"], description });

const TOOLS: BetaTool[] = [
  {
    name: "freie_termine",
    description:
      "Liefert freie Beratungstermine (alle Tätowierer zusammen, NEEDL verteilt fair). Ohne Datum: die nächsten 14 Tage. Nur diese Zeiten darfst du anbieten.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        von: nullableString("Erster Tag (YYYY-MM-DD) oder null"),
        bis: nullableString("Letzter Tag (YYYY-MM-DD) oder null"),
      },
      required: ["von", "bis"],
      additionalProperties: false,
    },
  },
  {
    name: "termin_buchen",
    description:
      "Bucht einen Beratungstermin für diesen Kunden. start muss genau eine id aus freie_termine sein. Erst nach Erfolg bestätigen.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        start: { type: "string", description: "id des Termins aus freie_termine" },
        form: {
          type: "string",
          enum: ["vor_ort", "telefon"],
          description: "vor_ort (Standard) oder telefon, wenn der Kunde nicht kommen kann",
        },
      },
      required: ["start", "form"],
      additionalProperties: false,
    },
  },
  {
    name: "termin_verschieben",
    description:
      "Verschiebt den gebuchten Beratungstermin des Kunden auf eine id aus freie_termine.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { start: { type: "string", description: "id aus freie_termine" } },
      required: ["start"],
      additionalProperties: false,
    },
  },
  {
    name: "termin_absagen",
    description:
      "Sagt den gebuchten Beratungstermin ab – nur wenn der Kunde das ausdrücklich will.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "tattoo_idee_speichern",
    description:
      "Speichert, was du über die Tattoo-Idee weißt. Felder, zu denen nichts Neues bekannt ist, auf null lassen – Bekanntes bleibt erhalten.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        motiv: nullableString("Motiv"),
        stelle: nullableString("Körperstelle"),
        groesse: nullableString("Größe, z. B. „ca. 10 cm“ oder „Unterarm-Innenseite“"),
        stil: nullableString("Stil"),
        farbe: { type: "string", enum: ["farbe", "schwarz_grau", "unbekannt"] },
        cover_up: { type: ["boolean", "null"] },
        zeitrahmen: nullableString("Wann der Kunde das Tattoo möchte"),
        sonstiges: nullableString("Weitere Wünsche (keine Gesundheitsdaten)"),
        referenzbilder_uebernehmen: {
          type: "boolean",
          description: "true, wenn die Bilder des Kunden Referenzen für die Idee sind",
        },
      },
      required: [
        "motiv",
        "stelle",
        "groesse",
        "stil",
        "farbe",
        "cover_up",
        "zeitrahmen",
        "sonstiges",
        "referenzbilder_uebernehmen",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "antworten",
    description:
      "Beendet die Runde: die WhatsApp-Nachricht an den Kunden (leer = nichts senden), der Modus, die aktualisierte Akte und ob an einen Menschen übergeben wird.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        nachricht: { type: "string", description: "Höchstens 3 Sätze, eine Frage" },
        modus: { type: "string", enum: ["spass", "beratung", "abschluss", "einwand", "rueckzug"] },
        akte: { type: "string", description: `Höchstens ${MAX_MEMORY_LENGTH} Zeichen` },
        uebergabe: { type: "boolean" },
        uebergabe_grund: nullableString("Grund der Übergabe oder null"),
      },
      required: ["nachricht", "modus", "akte", "uebergabe", "uebergabe_grund"],
      additionalProperties: false,
    },
  },
];

const slotQuery = z.object({ von: z.string().nullable(), bis: z.string().nullable() });
const bookInput = z.object({ start: z.string().min(1), form: z.enum(["vor_ort", "telefon"]) });
const moveInput = z.object({ start: z.string().min(1) });
const ideaInput = z.object({
  motiv: z.string().nullable(),
  stelle: z.string().nullable(),
  groesse: z.string().nullable(),
  stil: z.string().nullable(),
  farbe: z.enum(["farbe", "schwarz_grau", "unbekannt"]),
  cover_up: z.boolean().nullable(),
  zeitrahmen: z.string().nullable(),
  sonstiges: z.string().nullable(),
  referenzbilder_uebernehmen: z.boolean(),
});
const answerInput = z.object({
  nachricht: z.string(),
  modus: z.enum(["spass", "beratung", "abschluss", "einwand", "rueckzug"]),
  akte: z.string(),
  uebergabe: z.boolean(),
  uebergabe_grund: z.string().nullable(),
});
type Answer = z.infer<typeof answerInput>;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

function fmt(date: Date, tz: string, opts: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: tz, ...opts }).format(date);
}
const slotLabel = (d: Date, tz: string) =>
  fmt(d, tz, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Customer text must not be able to close the data tags. */
const asData = (text: string) => text.replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"));

const SPEAKER: Record<string, string> = {
  customer: "kunde",
  bot: "studio (du)",
  human: "studio (team)",
  automatic: "studio (automatisch)",
};

async function loadChat(deps: BrainDeps, leadId: string, now: Date) {
  return deps.prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      consultations: {
        where: { status: "SCHEDULED", endsAt: { gt: now }, walkIn: false },
        orderBy: { startsAt: "asc" },
        take: 1,
        include: { tattooer: { include: { user: { select: { name: true } } } } },
      },
      messages: { orderBy: { sentAt: "desc" }, take: HISTORY_MESSAGES },
      attachments: { where: { status: "STORED" }, select: { id: true } },
    },
  });
}
type Chat = NonNullable<Awaited<ReturnType<typeof loadChat>>>;

function buildContext(chat: Chat, now: Date, tz: string): string {
  const c = chat.consultations[0];
  const lines = [...chat.messages].reverse().map((m) => {
    const who =
      m.direction === "INBOUND"
        ? "customer"
        : m.sentByBot
          ? "bot"
          : m.sentById
            ? "human"
            : "automatic";
    const when = fmt(m.sentAt, tz, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const body =
      m.body?.trim() || (m.templateName ? `[Vorlage ${m.templateName}]` : "[Bild/Datei]");
    return who === "customer"
      ? `[${when}] kunde: <nachricht>${asData(body)}</nachricht>`
      : `[${when}] ${SPEAKER[who]}: ${body}`;
  });
  return [
    `Jetzt: ${fmt(now, tz, { dateStyle: "full", timeStyle: "short" })} (${tz})`,
    `Vorname des Kunden: ${asData(chat.name.trim().split(/\s+/)[0] || "unbekannt")}`,
    `Akte (deine Notizen): ${chat.botMemory ? asData(chat.botMemory) : "(leer – erster Kontakt mit dir)"}`,
    `Tattoo-Idee bisher: ${chat.tattooSummary ? JSON.stringify(chat.tattooSummary) : "(noch nichts gespeichert)"}`,
    `Gebuchter Beratungstermin: ${
      c
        ? `${slotLabel(c.startsAt, tz)} Uhr, ${c.mode === "PHONE" ? "telefonisch" : "vor Ort"}, bei ${c.tattooer.user.name.split(/\s+/)[0]}`
        : "keiner"
    }`,
    `Bilder vom Kunden: ${chat.attachments.length}`,
    "",
    "<verlauf>",
    ...lines,
    "</verlauf>",
    "",
    "Antworte jetzt auf die neuen Nachrichten des Kunden am Ende des Verlaufs.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type TurnOutcome = "sent" | "handover" | "silent" | "skipped";

export interface TurnResult {
  outcome: TurnOutcome;
  reply?: string;
  mode?: string;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export async function runBotTurn(deps: BrainDeps, leadId: string): Promise<TurnResult> {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const tz = deps.timeZone ?? DEFAULT_TIME_ZONE;
  const cfg = deps.config ?? brainConfigFromEnv();

  const chat = await loadChat(deps, leadId, now);
  if (!chat || !botActiveFor(chat, await isBotGloballyEnabled(prisma)))
    return { outcome: "skipped" };

  const knowledge = toKnowledge(
    (await prisma.botKnowledge.findUnique({ where: { id: 1 } })) as Record<string, unknown> | null,
  );
  const allowedLinks = Object.values(knowledge.links).filter(Boolean) as string[];
  const forbiddenWords = forbiddenWordList(knowledge.forbiddenWords);

  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const log: Array<Record<string, unknown>> = [];
  let hasUpcoming = chat.consultations.length > 0;
  let consultationId: string | null = chat.consultations[0]?.id ?? null;
  let bookedThisTurn = false;
  let offered = new Set<string>();
  let rejections = 0;
  let nudged = false;
  let answer = null as Answer | null;
  let handoverReason = null as string | null;

  const messages: BetaMessageParam[] = [{ role: "user", content: buildContext(chat, now, tz) }];
  const system = [
    {
      type: "text" as const,
      text: buildSystemPrompt(knowledge),
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const run = async (
    name: string,
    raw: unknown,
  ): Promise<{ content: string; isError?: boolean }> => {
    try {
      switch (name) {
        case "freie_termine": {
          const q = slotQuery.parse(raw);
          const from = q.von && isLocalDate(q.von) ? startOfLocalDay(q.von, tz) : undefined;
          const to =
            q.bis && isLocalDate(q.bis) ? startOfLocalDay(addDays(q.bis, 1), tz) : undefined;
          const { slots } = await botSlots(deps, { from, to });
          const picked = spreadSlots(
            slots.map((s) => s.start),
            tz,
            12,
          );
          offered = new Set([...offered, ...picked.map((d) => d.toISOString())]);
          if (!picked.length)
            return { content: "Keine freien Beratungstermine in diesem Zeitraum." };
          return {
            content: picked
              .map((d) => `id ${d.toISOString()} = ${slotLabel(d, tz)} Uhr`)
              .join("\n"),
          };
        }
        case "termin_buchen": {
          const i = bookInput.parse(raw);
          if (!offered.has(new Date(i.start).toISOString()))
            return {
              content: "Diese Zeit kam nicht aus freie_termine. Erst freie_termine abfragen.",
              isError: true,
            };
          if (hasUpcoming)
            return {
              content: "Der Kunde hat schon einen Termin – verschieben statt neu buchen.",
              isError: true,
            };
          const c = await botBook(deps, leadId, {
            startsAt: i.start,
            mode: i.form === "telefon" ? "PHONE" : "ON_SITE",
          });
          bookedThisTurn = hasUpcoming = true;
          consultationId = c.id;
          return {
            content: `Gebucht: ${slotLabel(c.startsAt, tz)} Uhr, ${c.mode === "PHONE" ? "telefonisch" : "vor Ort"}, bei ${c.tattooerFirstName}.`,
          };
        }
        case "termin_verschieben": {
          const i = moveInput.parse(raw);
          if (!consultationId)
            return { content: "Es gibt keinen gebuchten Termin.", isError: true };
          if (!offered.has(new Date(i.start).toISOString()))
            return { content: "Diese Zeit kam nicht aus freie_termine.", isError: true };
          const c = await botReschedule(deps, consultationId, { startsAt: i.start });
          consultationId = c.id;
          bookedThisTurn = true;
          return { content: `Verschoben auf ${slotLabel(c.startsAt, tz)} Uhr.` };
        }
        case "termin_absagen": {
          if (!consultationId)
            return { content: "Es gibt keinen gebuchten Termin.", isError: true };
          await botCancel(deps, consultationId);
          consultationId = null;
          hasUpcoming = false;
          return { content: "Termin abgesagt." };
        }
        case "tattoo_idee_speichern": {
          const i = ideaInput.parse(raw);
          const prev = (chat.tattooSummary ?? {}) as Record<string, unknown>;
          const next: Record<string, unknown> = { ...prev };
          delete next.updatedAt;
          delete next.referenceImageCount;
          const set = (key: string, v: unknown) => {
            if (v !== null && v !== "") next[key] = typeof v === "string" ? v.trim() : v;
          };
          set("motif", i.motiv);
          set("placement", i.stelle);
          set("size", i.groesse);
          set("style", i.stil);
          set(
            "color",
            i.farbe === "farbe" ? "color" : i.farbe === "schwarz_grau" ? "black_grey" : null,
          );
          set("coverUp", i.cover_up);
          set("timeframe", i.zeitrahmen);
          set("notes", i.sonstiges);
          if (i.referenzbilder_uebernehmen && chat.attachments.length)
            next.referenceAttachmentIds = chat.attachments.map((a) => a.id);
          const saved = await botSaveTattooSummary(deps, leadId, next);
          chat.tattooSummary = saved.tattooSummary as Prisma.JsonValue;
          return { content: "Gespeichert." };
        }
        default:
          return { content: `Unbekanntes Werkzeug ${name}.`, isError: true };
      }
    } catch (err) {
      const e = toBotApiError(err);
      return { content: `Fehler: ${e.message}`, isError: true };
    }
  };

  for (let round = 0; round < MAX_ROUNDS && !answer && !handoverReason; round++) {
    const res = await deps.brain.create({
      model: cfg.model,
      max_tokens: cfg.maxTokens,
      system,
      tools: TOOLS,
      tool_choice: { type: "auto" },
      thinking: { type: "adaptive" },
      output_config: { effort: cfg.effort },
      messages,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    });
    addUsage(usage, res);
    if (res.stop_reason === "refusal") {
      handoverReason = "Das Modell hat die Antwort verweigert.";
      break;
    }
    const toolUses = res.content.filter(
      (b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use",
    );
    messages.push({ role: "assistant", content: res.content });
    if (!toolUses.length) {
      if (nudged || res.stop_reason === "max_tokens") {
        handoverReason = "Der Bot hat keine Antwort geliefert.";
        break;
      }
      nudged = true;
      messages.push({ role: "user", content: "Beende die Runde mit dem Werkzeug antworten." });
      continue;
    }

    // Run the other tools first, so a booking in the same response counts for the reply check.
    const ordered = [...toolUses].sort(
      (a, b) => Number(a.name === "antworten") - Number(b.name === "antworten"),
    );
    const results: BetaToolResultBlockParam[] = [];
    for (const t of ordered) {
      if (t.name !== "antworten") {
        const r = await run(t.name, t.input);
        log.push({ tool: t.name, input: t.input, ok: !r.isError, result: r.content.slice(0, 300) });
        results.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: r.content,
          is_error: r.isError,
        });
        continue;
      }
      const parsed = answerInput.safeParse(t.input);
      if (!parsed.success) {
        results.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: "Ungültige Eingabe.",
          is_error: true,
        });
        continue;
      }
      const problems = parsed.data.nachricht.trim()
        ? checkReply(parsed.data.nachricht, {
            allowedLinks,
            forbiddenWords,
            bookedThisTurn,
            hasUpcoming,
          })
        : [];
      if (problems.length) {
        rejections++;
        log.push({ rejected: parsed.data.nachricht, problems });
        if (rejections >= MAX_REJECTIONS) {
          handoverReason = `Antwort zweimal von den Filtern abgelehnt: ${problems.join(" ")}`;
          answer = { ...parsed.data, nachricht: HANDOVER_TEXT, uebergabe: true };
        }
        results.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: `Nicht gesendet. Bitte neu formulieren: ${problems.join(" ")}`,
          is_error: true,
        });
        continue;
      }
      answer = parsed.data;
      results.push({ type: "tool_result", tool_use_id: t.id, content: "OK" });
    }
    if (!answer && !handoverReason) messages.push({ role: "user", content: results });
  }
  if (!answer && !handoverReason) handoverReason = "Zu viele Schritte ohne Antwort.";

  // ------------------------------------------------------------------ finish
  const handover = Boolean(handoverReason) || Boolean(answer?.uebergabe);
  const reason =
    handoverReason ??
    (answer?.uebergabe ? answer.uebergabe_grund || "Übergabe durch den Bot" : null);
  const text = (
    handover && !answer?.nachricht.trim() ? HANDOVER_TEXT : (answer?.nachricht ?? HANDOVER_TEXT)
  ).trim();

  let sendError: string | null = null;
  if (text) {
    try {
      await sendBotReply(deps, { leadId, text });
    } catch (err) {
      sendError = err instanceof Error ? err.message : String(err);
    }
  }
  if (answer)
    await prisma.lead.update({
      where: { id: leadId },
      data: { botMemory: answer.akte.trim().slice(0, MAX_MEMORY_LENGTH) || null },
    });
  if (handover) {
    await setBotEnabled(prisma, leadId, false, { reason: "BOT_HANDOVER", now });
    await prisma.lead.update({
      where: { id: leadId },
      data: { botHandoverNote: (reason ?? "").slice(0, 500) },
    });
  }

  const outcome: TurnOutcome = handover ? "handover" : text ? "sent" : "silent";
  await prisma.botTurn.create({
    data: {
      leadId,
      model: cfg.model,
      ...usage,
      outcome: sendError ? "error" : outcome,
      mode: answer?.modus ?? null,
      reply: text || null,
      log: log as unknown as Prisma.InputJsonValue,
      error: sendError ?? (handover ? reason : null),
    },
  });
  return { outcome, reply: text || undefined, mode: answer?.modus };
}

function addUsage(u: Usage, res: BetaMessage) {
  u.inputTokens += res.usage?.input_tokens ?? 0;
  u.outputTokens += res.usage?.output_tokens ?? 0;
  u.cacheReadTokens += res.usage?.cache_read_input_tokens ?? 0;
  u.cacheWriteTokens += res.usage?.cache_creation_input_tokens ?? 0;
}

/** Up to `max` start times, spread over the days (at most 2 per day, morning and later). */
export function spreadSlots(starts: Date[], tz: string, max: number): Date[] {
  const byDay = new Map<string, Date[]>();
  for (const s of starts) {
    const day = fmt(s, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const out: Date[] = [];
  for (const list of byDay.values()) {
    if (out.length >= max) break;
    out.push(list[0]);
    if (list.length > 1 && out.length < max) out.push(list[Math.floor(list.length * 0.6)]);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}
