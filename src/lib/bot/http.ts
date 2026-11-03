import "server-only";
import { prisma } from "../db";
import { APP_TIMEZONE } from "../format";
import { createCalendarClient } from "../google/client";
import { createWhatsAppClient } from "../whatsapp/client";
import { checkBotAuth } from "./auth";
import { toBotApiError, type BotDeps } from "./service";

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Wraps a bot API handler: API-key check, JSON body parsing, error mapping. */
export function botRoute<P>(
  handler: (ctx: { deps: BotDeps; request: Request; params: P; body: unknown }) => Promise<unknown>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const auth = checkBotAuth(request.headers.get("authorization"));
    if (auth === 503)
      return json(503, {
        error: { code: "NOT_CONFIGURED", message: "Bot-API ist nicht eingerichtet." },
      });
    if (auth === 401)
      return json(401, { error: { code: "UNAUTHORIZED", message: "Ungültiger API-Schlüssel." } });

    let body: unknown = undefined;
    if (request.method !== "GET" && request.method !== "DELETE") {
      try {
        body = await request.json();
      } catch {
        return json(400, { error: { code: "INVALID_JSON", message: "Body muss JSON sein." } });
      }
    }
    try {
      const deps: BotDeps = {
        prisma,
        calendar: createCalendarClient(),
        whatsapp: createWhatsAppClient(),
        timeZone: APP_TIMEZONE,
        appUrl: process.env.APP_URL,
      };
      const data = await handler({ deps, request, params: await context.params, body });
      return json(200, { data });
    } catch (err) {
      const e = toBotApiError(err);
      return json(e.status, { error: { code: e.code, message: e.message } });
    }
  };
}
