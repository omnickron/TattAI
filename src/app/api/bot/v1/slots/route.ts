import { botRoute } from "@/lib/bot/http";
import { botSlots, slotQuerySchema } from "@/lib/bot/service";

/** GET /api/bot/v1/slots?from=ISO&to=ISO – free consultation start times. */
export const GET = botRoute(async ({ deps, request }) => {
  const params = new URL(request.url).searchParams;
  return botSlots(deps, slotQuerySchema.parse(Object.fromEntries(params)));
});
