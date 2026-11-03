import { botRoute } from "@/lib/bot/http";
import { botSendMessage } from "@/lib/bot/service";

/** POST /api/bot/v1/leads/{id}/messages { text } – reply within the 24-hour window. */
export const POST = botRoute<{ id: string }>(async ({ deps, params, body }) =>
  botSendMessage(deps, params.id, body),
);
