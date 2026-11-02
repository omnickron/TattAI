import type { CountryCode } from "libphonenumber-js";
import { normalizePhone } from "../phone";
import type { MetaLeadData } from "./types";

export interface ConsentSettings {
  /** Key of the consent checkbox (custom disclaimer) in the instant form. */
  checkboxKey: string | null;
  /** Wording shown to the user; stored as snapshot on the lead. */
  text: string | null;
}

export interface MappedLead {
  name: string;
  phoneRaw: string | null;
  phoneE164: string | null;
  phoneValid: boolean;
  email: string | null;
  whatsappConsent: boolean;
  whatsappConsentAt: Date | null;
  whatsappConsentText: string | null;
  metaCreatedAt: Date | null;
}

const TRUTHY = new Set(["1", "true", "yes", "ja", "on", "checked"]);

function field(lead: MetaLeadData, ...names: string[]): string | null {
  for (const name of names) {
    const value = lead.field_data?.find((f) => f.name.toLowerCase() === name)?.values?.[0];
    if (value && value.trim()) return value.trim();
  }
  return null;
}

function isTruthy(value: unknown): boolean {
  return value === true || (typeof value === "string" && TRUTHY.has(value.trim().toLowerCase()));
}

/**
 * Determines WhatsApp consent. Primary source is the custom disclaimer
 * checkbox; a form question with the same key is accepted as fallback.
 * Without a configured key, consent is never assumed.
 */
export function hasConsent(lead: MetaLeadData, checkboxKey: string | null): boolean {
  if (!checkboxKey) return false;
  const key = checkboxKey.toLowerCase();
  const checkbox = lead.custom_disclaimer_responses?.find(
    (r) => r.checkbox_key?.toLowerCase() === key,
  );
  if (checkbox) return isTruthy(checkbox.is_checked);
  return isTruthy(field(lead, key));
}

export function mapMetaLead(
  lead: MetaLeadData,
  consent: ConsentSettings,
  defaultCountry: CountryCode,
): MappedLead {
  const first = field(lead, "first_name");
  const last = field(lead, "last_name");
  const name =
    field(lead, "full_name", "name") ?? ([first, last].filter(Boolean).join(" ") || "Unbekannt");
  const phone = normalizePhone(field(lead, "phone_number", "phone"), defaultCountry);
  const email = field(lead, "email")?.toLowerCase() ?? null;
  const createdAt = lead.created_time ? new Date(lead.created_time) : null;
  const metaCreatedAt = createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null;
  const consented = hasConsent(lead, consent.checkboxKey);

  return {
    name,
    phoneRaw: phone.raw || null,
    phoneE164: phone.e164,
    phoneValid: phone.valid,
    email,
    whatsappConsent: consented,
    whatsappConsentAt: consented ? (metaCreatedAt ?? new Date()) : null,
    whatsappConsentText: consented ? consent.text : null,
    metaCreatedAt,
  };
}
