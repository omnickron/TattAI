import { randomUUID } from "node:crypto";
import { setting } from "@/lib/integrations/store";

export interface SendTemplateInput {
  /** E.164 number, e.g. "+4915112345678" */
  to: string;
  name: string;
  language: string;
  /** Positional body parameters ({{1}}, {{2}}, …) */
  parameters: string[];
}

export interface TemplateSubmission {
  name: string;
  language: string;
  category: "UTILITY" | "MARKETING";
  /** Body with positional placeholders */
  text: string;
  examples: string[];
}

export type MetaTemplateStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";

export interface WhatsAppClient {
  readonly mock: boolean;
  sendTemplate(input: SendTemplateInput): Promise<{ messageId: string }>;
  sendText(input: { to: string; body: string }): Promise<{ messageId: string }>;
  submitTemplate(t: TemplateSubmission): Promise<{ id: string; status: MetaTemplateStatus }>;
  updateTemplate(metaId: string, t: TemplateSubmission): Promise<{ status: MetaTemplateStatus }>;
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code: number | null,
    readonly httpStatus: number | null,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

export type ErrorHandling = "PAUSE" | "RETRY" | "PERMANENT";

/**
 * How the dispatcher reacts to a WhatsApp Cloud API error code.
 * PAUSE: account-level problem (spam/quality/policy/template) → stop all sending.
 * RETRY: temporary → try again later. PERMANENT: this message cannot be delivered.
 */
export function classifyError(
  code: number | null,
  httpStatus: number | null = null,
): ErrorHandling {
  switch (code) {
    case 131048: // spam rate limit hit
    case 131031: // business account locked
    case 368: // temporarily blocked for policy violations
    case 80007: // WABA rate limit
    case 133010: // phone number not registered
    case 131042: // payment issue
    case 190: // access token expired/invalid
      return "PAUSE";
    case 130429: // throughput limit
    case 131056: // too many messages to the same recipient
    case 131000: // generic error
    case 131016: // service unavailable
    case 1:
    case 2:
      return "RETRY";
    case 131026: // recipient not on WhatsApp / undeliverable
    case 131047: // outside the 24 h window
    case 131051: // unsupported message type
    case 131008: // required parameter missing
    case 131009: // parameter value invalid
    case 100: // invalid parameter
      return "PERMANENT";
  }
  if (code !== null && code >= 132000 && code < 133000) return "PAUSE"; // template problems
  if (httpStatus !== null && httpStatus >= 500) return "RETRY";
  if (code === null) return "RETRY"; // network errors, timeouts
  return "PERMANENT";
}

/** WhatsApp Cloud API (Graph API) client. */
export class CloudApiClient implements WhatsAppClient {
  readonly mock = false;

  constructor(
    private readonly opts: {
      accessToken: string;
      phoneNumberId: string;
      businessAccountId: string;
      apiVersion: string;
    },
  ) {}

  private async post<T>(path: string, body: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`https://graph.facebook.com/${this.opts.apiVersion}/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.opts.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new WhatsAppApiError(
        `Netzwerkfehler: ${err instanceof Error ? err.message : err}`,
        null,
        null,
      );
    }
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: number };
    } & T;
    if (!res.ok || json.error) {
      throw new WhatsAppApiError(
        `WhatsApp API ${res.status}: ${json.error?.message ?? "unbekannter Fehler"}`.slice(0, 500),
        json.error?.code ?? null,
        res.status,
      );
    }
    return json;
  }

  private to(e164: string) {
    return e164.replace(/^\+/, "");
  }

  async sendTemplate(input: SendTemplateInput) {
    const res = await this.post<{ messages: Array<{ id: string }> }>(
      `${this.opts.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: this.to(input.to),
        type: "template",
        template: {
          name: input.name,
          language: { code: input.language },
          components: input.parameters.length
            ? [
                {
                  type: "body",
                  parameters: input.parameters.map((text) => ({ type: "text", text })),
                },
              ]
            : [],
        },
      },
    );
    return { messageId: res.messages[0].id };
  }

  async sendText(input: { to: string; body: string }) {
    const res = await this.post<{ messages: Array<{ id: string }> }>(
      `${this.opts.phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: this.to(input.to),
        type: "text",
        text: { body: input.body, preview_url: false },
      },
    );
    return { messageId: res.messages[0].id };
  }

  private components(t: TemplateSubmission) {
    return [
      {
        type: "BODY",
        text: t.text,
        ...(t.examples.length ? { example: { body_text: [t.examples] } } : {}),
      },
    ];
  }

  async submitTemplate(t: TemplateSubmission) {
    const res = await this.post<{ id: string; status: MetaTemplateStatus }>(
      `${this.opts.businessAccountId}/message_templates`,
      { name: t.name, language: t.language, category: t.category, components: this.components(t) },
    );
    return { id: res.id, status: res.status ?? "PENDING" };
  }

  async updateTemplate(metaId: string, t: TemplateSubmission) {
    await this.post(metaId, { category: t.category, components: this.components(t) });
    return { status: "PENDING" as const };
  }
}

/**
 * Development stand-in: nothing leaves the machine. Templates are approved
 * immediately; numbers ending in "000" fail as "not on WhatsApp".
 */
export class MockWhatsAppClient implements WhatsAppClient {
  readonly mock = true;
  sent: Array<{ to: string; name?: string; body?: string; parameters?: string[] }> = [];

  async sendTemplate(input: SendTemplateInput) {
    if (input.to.endsWith("000"))
      throw new WhatsAppApiError("Mock: Empfänger nicht bei WhatsApp", 131026, 400);
    this.sent.push({ to: input.to, name: input.name, parameters: input.parameters });
    console.info(
      `[mock-whatsapp] template ${input.name} → ${input.to} (${input.parameters.join(" | ")})`,
    );
    return { messageId: `wamid.mock-${randomUUID()}` };
  }

  async sendText(input: { to: string; body: string }) {
    this.sent.push({ to: input.to, body: input.body });
    console.info(`[mock-whatsapp] text → ${input.to}: ${input.body.slice(0, 60)}`);
    return { messageId: `wamid.mock-${randomUUID()}` };
  }

  async submitTemplate() {
    return { id: `mock-template-${randomUUID()}`, status: "APPROVED" as const };
  }

  async updateTemplate() {
    return { status: "APPROVED" as const };
  }
}

export function isWhatsAppMock(): boolean {
  return setting("WHATSAPP_MOCK") === "true";
}

export function createWhatsAppClient(): WhatsAppClient {
  if (isWhatsAppMock()) return new MockWhatsAppClient();
  const accessToken = setting("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = setting("WHATSAPP_PHONE_NUMBER_ID");
  const businessAccountId = setting("WHATSAPP_BUSINESS_ACCOUNT_ID");
  if (!accessToken || !phoneNumberId || !businessAccountId) {
    throw new Error(
      "WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID must be set",
    );
  }
  return new CloudApiClient({
    accessToken,
    phoneNumberId,
    businessAccountId,
    apiVersion: process.env.WHATSAPP_API_VERSION || process.env.META_GRAPH_API_VERSION || "v23.0",
  });
}
