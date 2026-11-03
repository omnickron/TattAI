import { botRoute } from "@/lib/bot/http";
import { BotApiError, botFindLeadByPhone } from "@/lib/bot/service";

/** GET /api/bot/v1/leads?phone=+49… – find the lead of a WhatsApp number. */
export const GET = botRoute(async ({ deps, request }) => {
  const phone = new URL(request.url).searchParams.get("phone");
  if (!phone) throw new BotApiError(422, "VALIDATION_ERROR", "phone fehlt.");
  return botFindLeadByPhone(deps, phone);
});
