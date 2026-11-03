import { botRoute } from "@/lib/bot/http";
import { botLead } from "@/lib/bot/service";

/** GET /api/bot/v1/leads/{id} – lead, bot state, upcoming consultation, recent messages. */
export const GET = botRoute<{ id: string }>(async ({ deps, params }) => botLead(deps, params.id));
