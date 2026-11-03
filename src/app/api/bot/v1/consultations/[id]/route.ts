import { botRoute } from "@/lib/bot/http";
import { botCancel, botReschedule } from "@/lib/bot/service";

/** PATCH /api/bot/v1/consultations/{id} { startsAt } – reschedule. */
export const PATCH = botRoute<{ id: string }>(async ({ deps, params, body }) =>
  botReschedule(deps, params.id, body),
);

/** DELETE /api/bot/v1/consultations/{id} – cancel. */
export const DELETE = botRoute<{ id: string }>(async ({ deps, params }) =>
  botCancel(deps, params.id),
);
