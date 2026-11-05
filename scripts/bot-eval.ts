// Runs the bot test with AI test customers once and prints the grades.
// Usage: npm run bot:test
// Server: docker compose -f deploy/docker-compose.prod.yml --env-file .env run --rm worker npx tsx scripts/bot-eval.ts
import "dotenv/config";
import { brainConfigFromEnv, createBrainClient } from "../src/lib/bot/brain";
import { runBotEval, type PersonaResult } from "../src/lib/bot/eval/run";
import { createPrismaClient } from "../src/lib/prisma-client";

const prisma = createPrismaClient();

async function main() {
  const brain = createBrainClient();
  if (!brain) throw new Error("ANTHROPIC_API_KEY fehlt.");
  const run = await prisma.botEvalRun.create({ data: { requestedBy: "Kommandozeile" } });
  const done = await runBotEval({ prisma, brain, config: brainConfigFromEnv() }, run.id);
  for (const r of (done.results ?? []) as unknown as PersonaResult[])
    console.log(`${r.grade ?? "-"}  ${r.label}${r.error ? `  (Fehler: ${r.error})` : ""}`);
  console.log(
    `Status ${done.status}, Durchschnitt ${(done.avgGrade ?? 0) / 100}, Kosten $${(done.costMicros / 1e6).toFixed(2)}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
