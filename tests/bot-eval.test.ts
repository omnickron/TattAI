import type {
  BetaMessage,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { BrainClient } from "@/lib/bot/brain";
import { PERSONAS } from "@/lib/bot/eval/personas";
import { hardChecks, runBotEval, TEST_LEAD_PREFIX } from "@/lib/bot/eval/run";
import { createTestPrisma, resetDatabase } from "./db";

const prisma = createTestPrisma();

const msg = (content: unknown[], stop = "end_turn"): BetaMessage =>
  ({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stop,
    usage: { input_tokens: 1000, output_tokens: 100 },
  }) as unknown as BetaMessage;

/** Plays customer, bot and grader depending on the request. */
class FakeClaude implements BrainClient {
  customerTurns = 0;
  judged: string[] = [];
  judgedSystem: string[] = [];
  constructor(
    private customer: string[],
    private botReply: string,
  ) {}
  async create(p: MessageCreateParamsNonStreaming) {
    const system = JSON.stringify(p.system);
    if (system.includes("Du spielst in einem Test")) {
      const line = this.customer[this.customerTurns++] ?? "[ENDE]";
      return msg([{ type: "text", text: line }]);
    }
    if (p.output_config?.format) {
      this.judged.push(String(p.messages[0].content));
      this.judgedSystem.push(String(p.system));
      return msg([
        {
          type: "text",
          text: JSON.stringify({
            note: 2,
            ziel_erreicht: true,
            regeln_eingehalten: true,
            probleme: ["Etwas lang"],
            vorschlag: "Kürzer schreiben",
          }),
        },
      ]);
    }
    return msg(
      [
        {
          type: "tool_use",
          id: `tu${this.customerTurns}`,
          name: "antworten",
          input: {
            nachricht: this.botReply,
            modus: "beratung",
            akte: "Lettering",
            uebergabe: false,
            uebergabe_grund: null,
          },
        },
      ],
      "tool_use",
    );
  }
}

let calendarIdBefore: string | null;

beforeEach(async () => {
  await resetDatabase(prisma);
  const u = await prisma.user.create({
    data: {
      name: "Alex",
      email: "alex@example.com",
      role: "TATTOOER",
      tattooerProfile: {
        create: { googleConnectedAt: new Date(), consultationCalendarId: "real-calendar" },
      },
    },
    include: { tattooerProfile: true },
  });
  calendarIdBefore = u.tattooerProfile!.consultationCalendarId;
  await prisma.botKnowledge.create({ data: { id: 1, location: "Gärtnerstraße 22" } });
});

afterAll(() => prisma.$disconnect());

describe("bot test with AI customers", () => {
  it("chats, grades, stores the results and deletes the test leads", async () => {
    const persona = PERSONAS.find((p) => p.key === "is-it-a-bot")!;
    const claude = new FakeClaude(
      ["Ich will ein Lettering", "Bist du ein Bot?", "[ENDE]"],
      "Manche Nachrichten werden durch eine KI automatisiert. Welches Wort soll es werden?",
    );
    const run = await prisma.botEvalRun.create({ data: {} });
    const done = await runBotEval(
      {
        prisma,
        brain: claude,
        config: { model: "claude-opus-5-5", effort: "low", maxTokens: 4000 },
        personas: [persona],
      },
      run.id,
    );
    expect(done).toMatchObject({ status: "DONE", avgGrade: 200 });
    expect(done.costMicros).toBeGreaterThan(0);
    const [r] = done.results as unknown as Array<Record<string, unknown>>;
    expect(r).toMatchObject({ key: "is-it-a-bot", grade: 2, hardFindings: [], rulesKept: true });
    expect((r.transcript as Array<{ from: string }>).map((l) => l.from)).toEqual([
      "studio",
      "kunde",
      "bot",
      "kunde",
      "bot",
    ]);
    expect(claude.judged[0]).toContain("Fragt, ob ein Bot schreibt");
    // The grader sees the studio knowledge, so facts from it are not "invented"
    expect(claude.judgedSystem[0]).toContain(
      "<standort>Gärtnerstraße 22</standort>"
        .replace("<standort>", "<standort>\n")
        .replace("</standort>", "\n</standort>"),
    );

    // Nothing left behind, real calendar settings untouched
    expect(await prisma.lead.count({ where: { name: { startsWith: TEST_LEAD_PREFIX } } })).toBe(0);
    const profile = await prisma.tattooerProfile.findFirstOrThrow();
    expect(profile.consultationCalendarId).toBe(calendarIdBefore);
  });

  it("checks the hard rules itself", () => {
    const p = PERSONAS.find((x) => x.key === "is-it-a-bot")!;
    const line = (text: string) => ({ from: "bot" as const, text });
    expect(
      hardChecks(p, [line("Das kostet ca. 150 €"), line("Wie alt bist du?")], {
        handedOver: false,
      }),
    ).toEqual([
      "Preis genannt: „Das kostet ca. 150 €“.",
      "Nach dem Alter gefragt.",
      "Auf die Frage nach einem Bot nicht mit dem KI-Hinweis geantwortet.",
    ]);
    const angry = PERSONAS.find((x) => x.key === "angry")!;
    expect(hardChecks(angry, [line("Ich bin ein echter Mensch.")], { handedOver: false })).toEqual([
      "Hat sich als Mensch ausgegeben.",
      "Nicht an einen Menschen übergeben.",
    ]);
  });
});
