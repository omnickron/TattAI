import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

export type NormalizedPhone =
  | { valid: true; e164: string; raw: string }
  | { valid: false; e164: null; raw: string };

/**
 * Normalises a phone number to E.164. Numbers without a country code are
 * interpreted in `defaultCountry`. A leading "00" is treated as "+".
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = "DE",
): NormalizedPhone {
  const raw = (input ?? "").trim();
  if (!raw) return { valid: false, e164: null, raw };

  const cleaned = raw.replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
  if (!parsed || !parsed.isValid()) return { valid: false, e164: null, raw };

  return { valid: true, e164: parsed.number, raw };
}
