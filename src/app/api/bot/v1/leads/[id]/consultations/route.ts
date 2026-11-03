import { botRoute } from "@/lib/bot/http";
import { botBook } from "@/lib/bot/service";

/** POST /api/bot/v1/leads/{id}/consultations { startsAt, mode? } – book fairly. */
export const POST = botRoute<{ id: string }>(async ({ deps, params, body }) =>
  botBook(deps, params.id, body),
);
