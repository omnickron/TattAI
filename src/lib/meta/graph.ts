import { createHmac } from "node:crypto";
import type { MetaLeadData, MetaLeadFetcher } from "./types";

const LEAD_FIELDS = [
  "id",
  "created_time",
  "form_id",
  "ad_id",
  "ad_name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "platform",
  "field_data",
  "custom_disclaimer_responses",
].join(",");

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

/** Fetches lead details from the Meta Graph API. */
export class GraphApiLeadFetcher implements MetaLeadFetcher {
  constructor(
    private readonly opts: { accessToken: string; appSecret: string; apiVersion: string },
  ) {}

  async fetchLead(leadgenId: string): Promise<MetaLeadData> {
    const { accessToken, appSecret, apiVersion } = this.opts;
    const proof = createHmac("sha256", appSecret).update(accessToken).digest("hex");
    const url = new URL(
      `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(leadgenId)}`,
    );
    url.searchParams.set("fields", LEAD_FIELDS);
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("appsecret_proof", proof);

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new MetaGraphError(`Graph API ${res.status}: ${text.slice(0, 500)}`, res.status);
    }
    return (await res.json()) as MetaLeadData;
  }
}

const SAMPLE_FIRST = [
  "Lena",
  "Jonas",
  "Mia",
  "Felix",
  "Sophie",
  "Leon",
  "Emma",
  "Paul",
  "Hannah",
  "Noah",
];
const SAMPLE_LAST = [
  "Müller",
  "Schmidt",
  "Schneider",
  "Fischer",
  "Weber",
  "Meyer",
  "Wagner",
  "Becker",
];
const SAMPLE_CAMPAIGNS = [
  { id: "120200000000000001", name: "Herbst Fineline" },
  { id: "120200000000000002", name: "Cover-up Aktion" },
  { id: "120200000000000003", name: "Allgemein Studio" },
];

function toAscii(value: string): string {
  return value.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Development stand-in for the Graph API: returns deterministic sample data
 * derived from the lead id, so no Meta account is needed.
 */
export class MockLeadFetcher implements MetaLeadFetcher {
  constructor(private readonly consentCheckboxKey = "whatsapp_consent") {}

  async fetchLead(leadgenId: string): Promise<MetaLeadData> {
    const h = hash(leadgenId);
    const first = SAMPLE_FIRST[h % SAMPLE_FIRST.length];
    const last = SAMPLE_LAST[(h >>> 4) % SAMPLE_LAST.length];
    const campaign = SAMPLE_CAMPAIGNS[(h >>> 8) % SAMPLE_CAMPAIGNS.length];
    const invalidPhone = h % 13 === 0;
    const phone = invalidPhone ? "12345" : `0151 ${String(10000000 + (h % 89999999)).slice(0, 8)}`;
    const withEmail = h % 3 !== 0;

    return {
      id: leadgenId,
      created_time: new Date().toISOString(),
      form_id: "900000000000001",
      ad_id: `${campaign.id}9${h % 3}`,
      ad_name: `Anzeige ${(h % 3) + 1}`,
      adset_id: `${campaign.id}8`,
      adset_name: `${campaign.name} – Zielgruppe 18-35`,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      platform: h % 2 ? "ig" : "fb",
      field_data: [
        { name: "full_name", values: [`${first} ${last}`] },
        { name: "phone_number", values: [phone] },
        ...(withEmail
          ? [{ name: "email", values: [toAscii(`${first}.${last}@example.com`.toLowerCase())] }]
          : []),
      ],
      custom_disclaimer_responses: [{ checkbox_key: this.consentCheckboxKey, is_checked: "1" }],
    };
  }
}
