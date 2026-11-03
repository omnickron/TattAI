import { botRoute } from "@/lib/bot/http";
import { botSaveTattooSummary } from "@/lib/bot/service";

/** PUT /api/bot/v1/leads/{id}/tattoo-summary – structured tattoo idea. */
export const PUT = botRoute<{ id: string }>(async ({ deps, params, body }) =>
  botSaveTattooSummary(deps, params.id, body),
);
