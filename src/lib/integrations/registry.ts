/**
 * Access data of the integrations that the operator can maintain in the app. The key is
 * the name of the environment variable that serves as fallback.
 */

export type IntegrationGroup = "teamup" | "whatsapp" | "meta";

export interface SettingDef {
  key: string;
  group: IntegrationGroup;
  label: string;
  /** Secret: stored encrypted, never shown again (only the last characters) */
  secret: boolean;
  hint?: string;
  /** Alternative env variable read when neither the app nor `key` has a value */
  envFallback?: string;
}

export const GROUPS: Array<{
  id: IntegrationGroup;
  title: string;
  intro: string;
  /** Setting that switches the sample mode ("true" = test mode with sample data) */
  modeKey: string;
}> = [
  {
    id: "teamup",
    title: "TeamUp",
    intro:
      "Gemeinsamer Studio-Kalender. Unterkalender und Künstler-Feld stellt der Admin unter Einstellungen ein.",
    modeKey: "TEAMUP_MOCK",
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    intro: "WhatsApp Cloud API: Erstansprache, Erinnerungen, Chat und Bot.",
    modeKey: "WHATSAPP_MOCK",
  },
  {
    id: "meta",
    title: "Meta-Leads",
    intro: "Lead-Formulare (Instant Forms): Leads per Webhook empfangen und Details abrufen.",
    modeKey: "META_GRAPH_MOCK",
  },
];

export const SETTINGS: SettingDef[] = [
  {
    key: "TEAMUP_API_KEY",
    group: "teamup",
    label: "API-Schlüssel",
    secret: true,
    hint: "TeamUp → Einstellungen → Integrations → API key",
  },
  {
    key: "TEAMUP_CALENDAR_KEY",
    group: "teamup",
    label: "Kalender-Schlüssel",
    secret: true,
    hint: "Freigabe-Link mit „Modify“ (Sharing) – Schlüssel oder ganzer Link",
  },
  {
    key: "WHATSAPP_ACCESS_TOKEN",
    group: "whatsapp",
    label: "Zugriffstoken (System-Nutzer)",
    secret: true,
  },
  {
    key: "WHATSAPP_PHONE_NUMBER_ID",
    group: "whatsapp",
    label: "Telefonnummer-ID",
    secret: false,
  },
  {
    key: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    group: "whatsapp",
    label: "WhatsApp-Business-Konto-ID",
    secret: false,
  },
  {
    key: "WHATSAPP_APP_SECRET",
    group: "whatsapp",
    label: "App-Geheimnis",
    secret: true,
    hint: "Prüft die Signatur der WhatsApp-Webhooks (leer = App-Geheimnis von Meta-Leads)",
    envFallback: "META_APP_SECRET",
  },
  {
    key: "WHATSAPP_VERIFY_TOKEN",
    group: "whatsapp",
    label: "Verify-Token (Webhook)",
    secret: true,
    hint: "Frei wählbar, muss in Meta beim Webhook genauso eingetragen sein",
  },
  {
    key: "META_APP_ID",
    group: "meta",
    label: "App-ID",
    secret: false,
    hint: "Steht oben im App-Dashboard bei developers.facebook.com",
  },
  {
    key: "META_PAGE_ACCESS_TOKEN",
    group: "meta",
    label: "Seiten-Zugriffstoken",
    secret: true,
  },
  {
    key: "META_APP_SECRET",
    group: "meta",
    label: "App-Geheimnis",
    secret: true,
  },
  {
    key: "META_VERIFY_TOKEN",
    group: "meta",
    label: "Verify-Token (Webhook)",
    secret: true,
    hint: "Frei wählbar, muss in Meta beim Webhook genauso eingetragen sein",
  },
];

export const MODE_KEYS = GROUPS.map((g) => g.modeKey);
export const ALL_KEYS = new Set([...SETTINGS.map((s) => s.key), ...MODE_KEYS]);
export const settingDef = (key: string) => SETTINGS.find((s) => s.key === key);
