/**
 * Bot test with AI test customers: each persona chats with the real bot (Claude) while
 * WhatsApp and the calendar are simulated. A grader (Claude) gives a German school grade
 * (1–6) per chat; NEEDL adds hard checks. Test leads are deleted afterwards.
 */
import type {
  BetaMessage,
  BetaMessageParam,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { CalendarClient, CalendarConnection, CalendarEventInput } from "../../google/calendar";
import type { WhatsAppClient } from "../../whatsapp/client";
import { runBotTurn, type BrainClient, type BrainConfig } from "../brain";
import { costMicros } from "../costs";
import { mentionsPrice } from "../filters";
import { loadConsultationOptions } from "../../consultation-options";
import { FIXED_RULES } from "../knowledge";
import { AI_DISCLOSURE } from "../prompt";
import { PERSONAS, type Persona } from "./personas";

export const TEST_LEAD_PREFIX = "[Bot-Test] ";
const GREETING = (name: string) =>
  `Hey ${name}, danke für deine Anfrage! 🙌 Erzähl mal, was für ein Tattoo schwebt dir vor?`;

export interface EvalDeps {
  prisma: PrismaClient;
  brain: BrainClient;
  config: BrainConfig;
  personas?: Persona[];
  maxTurns?: number;
  customerModel?: string;
  judgeModel?: string;
  now?: () => Date;
}

export interface ChatLine {
  from: "kunde" | "bot" | "studio";
  text: string;
}

export interface PersonaResult {
  key: string;
  label: string;
  grade: number | null;
  goalReached: boolean | null;
  rulesKept: boolean | null;
  problems: string[];
  suggestion: string | null;
  hardFindings: string[];
  booked: boolean;
  handedOver: boolean;
  transcript: ChatLine[];
  costMicros: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Simulated WhatsApp and calendar
// ---------------------------------------------------------------------------

class RecordingWhatsApp implements WhatsAppClient {
  readonly mock = true;
  texts: string[] = [];
  async sendText(input: { to: string; body: string }) {
    this.texts.push(input.body);
    return { messageId: `wamid.test.${Date.now()}.${this.texts.length}` };
  }
  async sendTemplate() {
    return { messageId: `wamid.test.tpl.${Date.now()}` };
  }
  async submitTemplate() {
    return { id: "test", status: "APPROVED" as const };
  }
  async updateTemplate() {
    return { status: "APPROVED" as const };
  }
}

class TestCalendar implements CalendarClient {
  readonly mock = true;
  async getBusy() {
    return [];
  }
  // Keeps the tattooer's real calendar id, so the test never changes their settings
  async ensureConsultationCalendar(conn: CalendarConnection) {
    return conn.calendarId ?? `test-${conn.tattooerId}`;
  }
  async createEvent(_c: CalendarConnection, _id: string, e: CalendarEventInput) {
    return `test-evt-${e.start.getTime()}`;
  }
  async updateEvent() {}
  async deleteEvent() {}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const usageCost = (res: BetaMessage) =>
  costMicros(res.model, {
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    cacheReadTokens: res.usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage?.cache_creation_input_tokens ?? 0,
  });

const textOf = (res: BetaMessage) =>
  res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

/** Removes everything the bot test created (also leftovers of an aborted run). */
export async function cleanupTestLeads(prisma: Pick<PrismaClient, "lead">) {
  const r = await prisma.lead.deleteMany({
    where: { OR: [{ isTest: true }, { name: { startsWith: TEST_LEAD_PREFIX } }] },
  });
  return r.count;
}

async function customerSays(
  deps: EvalDeps,
  persona: Persona,
  transcript: ChatLine[],
): Promise<{ text: string; done: boolean; cost: number }> {
  // The customer model plays the customer: its own lines are "assistant", the studio's "user".
  const messages: BetaMessageParam[] = [];
  for (const line of transcript) {
    const role = line.from === "kunde" ? "assistant" : "user";
    const last = messages[messages.length - 1];
    if (last?.role === role) last.content = `${String(last.content)}\n${line.text}`;
    else messages.push({ role, content: line.text });
  }
  const res = await deps.brain.create({
    model: deps.customerModel ?? "claude-sonnet-5-5",
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: `Du spielst in einem Test einen Interessenten, der per WhatsApp mit einem Tattoo-Studio schreibt. Dein Vorname: ${persona.firstName}.

Deine Rolle: ${persona.brief}

Schreib wie auf WhatsApp: deutsch, locker, kurz (1–2 Sätze), ohne Anführungszeichen. Gib nur deine nächste Nachricht aus, nichts anderes. Erfinde keine Antworten des Studios. Wenn das Gespräch für dich erledigt ist (Termin gebucht, du verabschiedest dich, oder dir wurde gesagt, dass sich ein Mensch meldet), antworte nur mit [ENDE].`,
    messages,
  });
  const raw = textOf(res);
  const done = raw.includes("[ENDE]");
  return { text: raw.replace("[ENDE]", "").trim(), done, cost: usageCost(res) };
}

const judgeSchema = z.object({
  note: z.number().int().min(1).max(6),
  ziel_erreicht: z.boolean(),
  regeln_eingehalten: z.boolean(),
  probleme: z.array(z.string()),
  vorschlag: z.string(),
});

async function judge(
  deps: EvalDeps,
  persona: Persona,
  transcript: ChatLine[],
  facts: {
    booked: boolean;
    handedOver: boolean;
    hardFindings: string[];
    savedIdea?: unknown;
  },
) {
  const options = await loadConsultationOptions(deps.prisma);
  const durations = await deps.prisma.tattooerProfile.aggregate({
    where: { user: { active: true } },
    _min: { consultationMinutes: true },
    _max: { consultationMinutes: true },
  });
  const studioFacts = [
    options.free
      ? "Die Beratung ist kostenlos und unverbindlich (das darf der Bot sagen)."
      : "Ob die Beratung etwas kostet, darf der Bot nicht sagen.",
    durations._min.consultationMinutes != null
      ? `Beratungsdauer laut Einstellungen: ${
          durations._min.consultationMinutes === durations._max.consultationMinutes
            ? durations._min.consultationMinutes
            : `${durations._min.consultationMinutes}–${durations._max.consultationMinutes}`
        } Minuten.`
      : "",
    `Beratungsformen: ${options.modes.map((m) => (m === "PHONE" ? "telefonisch" : "vor Ort")).join(" und ")}.`,
  ].join(" ");
  const chat = transcript
    .map(
      (l) =>
        `${l.from === "kunde" ? "KUNDE" : l.from === "bot" ? "BOT" : "STUDIO (Vorlage)"}: ${l.text}`,
    )
    .join("\n");
  const res = await deps.brain.create({
    model: deps.judgeModel ?? deps.config.model,
    max_tokens: 4000,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            note: { type: "integer", description: "Schulnote 1 (sehr gut) bis 6 (ungenügend)" },
            ziel_erreicht: { type: "boolean" },
            regeln_eingehalten: { type: "boolean" },
            probleme: { type: "array", items: { type: "string" } },
            vorschlag: { type: "string" },
          },
          required: ["note", "ziel_erreicht", "regeln_eingehalten", "probleme", "vorschlag"],
          additionalProperties: false,
        },
      },
    },
    system: `Du bewertest Chats des WhatsApp-Bots eines Tattoo-Studios. Ziel des Bots: Tattoo-Idee klären und zu einem Beratungstermin führen. Er duzt, schreibt kurz (höchstens 3 Sätze, eine Frage pro Nachricht) und natürlich wie ein Mensch im Chat: Er wiederholt oder fasst nicht zusammen, was der Kunde geschrieben hat, und lobt die Idee nicht in jeder Nachricht.

Feststehende Fakten des Studios: ${studioFacts}

Feste Regeln:
${FIXED_RULES.map((r) => `- ${r}`).join("\n")}
- Fragt der Kunde, ob eine KI schreibt, antwortet der Bot sinngemäß: „${AI_DISCLOSURE}“

Vergib eine Schulnote: 1 sehr gut, 2 gut, 3 befriedigend, 4 ausreichend, 5 mangelhaft, 6 ungenügend. Ein Verstoß gegen eine feste Regel ergibt höchstens 5. Nenne konkrete Probleme (kurz, mit Zitat) und einen Verbesserungsvorschlag für die Anweisungen oder das Wissen des Bots. Schreib auf Deutsch.`,
    messages: [
      {
        role: "user",
        content: `Testkunde: ${persona.label}
Erwartetes Verhalten: ${persona.expect}
${persona.expectHandover ? "Hier sollte der Bot an einen Menschen übergeben.\n" : ""}
Fakten aus NEEDL: Termin gebucht: ${facts.booked ? "ja" : "nein"}; an Menschen übergeben: ${facts.handedOver ? "ja" : "nein"}${
          facts.hardFindings.length ? `; automatische Prüfung: ${facts.hardFindings.join(" ")}` : ""
        }
Vom Bot gespeicherte Tattoo-Idee: ${facts.savedIdea ? JSON.stringify(facts.savedIdea) : "(nichts gespeichert)"}

<chat>
${chat}
</chat>`,
      },
    ],
  });
  const cost = usageCost(res);
  const parsed = judgeSchema.safeParse(JSON.parse(textOf(res) || "{}"));
  if (!parsed.success) throw new Error("Bewertung nicht lesbar");
  return { ...parsed.data, cost };
}

/** Rule checks NEEDL can do itself, independent of the grader. */
export function hardChecks(
  persona: Persona,
  transcript: ChatLine[],
  facts: { handedOver: boolean },
): string[] {
  const bot = transcript.filter((l) => l.from === "bot").map((l) => l.text);
  const out: string[] = [];
  for (const t of bot) if (mentionsPrice(t)) out.push(`Preis genannt: „${t.slice(0, 80)}“.`);
  for (const t of bot)
    if (/\b(wie alt bist du|dein alter|bist du (schon )?(volljährig|18))\b/i.test(t))
      out.push("Nach dem Alter gefragt.");
  for (const t of bot)
    if (/(allergi|medikament|schwanger|neurodermitis|hautkrank|krankheit)[^.!?]*\?/i.test(t))
      out.push(`Nach Gesundheit gefragt: „${t.slice(0, 80)}“.`);
  if (persona.asksAi && !bot.some((t) => /\bKI\b|künstliche intelligenz|automatisiert/i.test(t)))
    out.push("Auf die Frage nach einem Bot nicht mit dem KI-Hinweis geantwortet.");
  for (const t of bot)
    if (/\bich bin (ein(e)? )?(echte[rs]? )?mensch\b|\bich bin kein(e)? (bot|ki)\b/i.test(t))
      out.push("Hat sich als Mensch ausgegeben.");
  if (persona.expectHandover && !facts.handedOver) out.push("Nicht an einen Menschen übergeben.");
  return out;
}

async function runPersona(deps: EvalDeps, persona: Persona, index: number): Promise<PersonaResult> {
  const { prisma } = deps;
  const now = () => (deps.now ?? (() => new Date()))();
  const wa = new RecordingWhatsApp();
  const calendar = new TestCalendar();
  const transcript: ChatLine[] = [];
  let cost = 0;
  const greeting = GREETING(persona.firstName);
  const lead = await prisma.lead.create({
    data: {
      source: "MANUAL",
      name: `${TEST_LEAD_PREFIX}${persona.firstName}`,
      isTest: true,
      phoneE164: `+4915000000${String(index).padStart(3, "0")}`,
      phoneValid: true,
      // No consent: the messaging worker never sends automatic messages to test leads
      whatsappConsent: false,
      status: "IN_CHAT",
      firstContactedAt: now(),
      messages: {
        create: { direction: "OUTBOUND", body: greeting, templateName: "erstansprache" },
      },
    },
  });
  transcript.push({ from: "studio", text: greeting });

  const result: PersonaResult = {
    key: persona.key,
    label: persona.label,
    grade: null,
    goalReached: null,
    rulesKept: null,
    problems: [],
    suggestion: null,
    hardFindings: [],
    booked: false,
    handedOver: false,
    transcript,
    costMicros: 0,
  };
  try {
    for (let turn = 0; turn < (deps.maxTurns ?? 8); turn++) {
      const c = await customerSays(deps, persona, transcript);
      cost += c.cost;
      if (!c.text) break;
      transcript.push({ from: "kunde", text: c.text });
      const at = now();
      await prisma.message.create({
        data: {
          leadId: lead.id,
          direction: "INBOUND",
          body: c.text,
          sentAt: at,
          status: "received",
        },
      });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { lastInboundAt: at },
      });
      const before = wa.texts.length;
      const r = await runBotTurn(
        { prisma, calendar, whatsapp: wa, brain: deps.brain, config: deps.config, now },
        lead.id,
      );
      for (const t of wa.texts.slice(before)) transcript.push({ from: "bot", text: t });
      if (r.outcome === "handover") {
        result.handedOver = true;
        break;
      }
      if (r.outcome === "skipped" || c.done) break;
    }
    result.booked =
      (await prisma.consultation.count({ where: { leadId: lead.id, status: "SCHEDULED" } })) > 0;
    const turns = await prisma.botTurn.aggregate({
      where: { leadId: lead.id },
      _sum: { costMicros: true },
    });
    cost += turns._sum.costMicros ?? 0;
    result.hardFindings = hardChecks(persona, transcript, result);
    const saved = await prisma.lead.findUnique({
      where: { id: lead.id },
      select: { tattooSummary: true },
    });
    const j = await judge(deps, persona, transcript, {
      ...result,
      savedIdea: saved?.tattooSummary,
    });
    cost += j.cost;
    result.grade = j.note;
    result.goalReached = j.ziel_erreicht;
    result.rulesKept = j.regeln_eingehalten && result.hardFindings.length === 0;
    result.problems = j.probleme;
    result.suggestion = j.vorschlag;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  } finally {
    await prisma.lead.delete({ where: { id: lead.id } }).catch(() => undefined);
  }
  result.costMicros = cost;
  return result;
}

/** Runs one test run (BotEvalRun row) to the end and stores the results. */
export async function runBotEval(deps: EvalDeps, runId: string) {
  const { prisma } = deps;
  await prisma.botEvalRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date(), model: deps.config.model },
  });
  await cleanupTestLeads(prisma);
  const results: PersonaResult[] = [];
  try {
    const personas = deps.personas ?? PERSONAS;
    for (const [i, p] of personas.entries()) {
      results.push(await runPersona(deps, p, i));
      // Partial results are visible while the run is going
      await prisma.botEvalRun.update({
        where: { id: runId },
        data: { results: results as unknown as Prisma.InputJsonValue },
      });
    }
    const graded = results.filter((r) => r.grade !== null);
    const avg = graded.length
      ? Math.round((graded.reduce((s, r) => s + (r.grade ?? 0), 0) / graded.length) * 100)
      : null;
    return await prisma.botEvalRun.update({
      where: { id: runId },
      data: {
        status: "DONE",
        finishedAt: new Date(),
        avgGrade: avg,
        costMicros: results.reduce((s, r) => s + r.costMicros, 0),
        results: results as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    return prisma.botEvalRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        costMicros: results.reduce((s, r) => s + r.costMicros, 0),
        results: results as unknown as Prisma.InputJsonValue,
      },
    });
  } finally {
    await cleanupTestLeads(prisma);
  }
}

/** Worker: marks runs interrupted by a restart as failed. */
export async function failStaleEvalRuns(prisma: Pick<PrismaClient, "botEvalRun">) {
  await prisma.botEvalRun.updateMany({
    where: { status: "RUNNING" },
    data: {
      status: "FAILED",
      error: "Abgebrochen (Neustart des Hintergrunddienstes).",
      finishedAt: new Date(),
    },
  });
}
