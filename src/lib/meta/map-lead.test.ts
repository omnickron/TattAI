import { describe, expect, it } from "vitest";
import { hasConsent, mapMetaLead } from "./map-lead";
import type { MetaLeadData } from "./types";

const consent = { checkboxKey: "whatsapp_consent", text: "Ich bin einverstanden …" };

function lead(overrides: Partial<MetaLeadData> = {}): MetaLeadData {
  return {
    id: "1",
    created_time: "2026-03-29T00:30:00+0000",
    field_data: [
      { name: "full_name", values: ["Lena Müller"] },
      { name: "phone_number", values: ["0151 23456789"] },
      { name: "email", values: ["Lena@Example.com"] },
    ],
    custom_disclaimer_responses: [{ checkbox_key: "whatsapp_consent", is_checked: "1" }],
    ...overrides,
  };
}

describe("mapMetaLead", () => {
  it("maps contact data and consent snapshot", () => {
    const mapped = mapMetaLead(lead(), consent, "DE");
    expect(mapped).toMatchObject({
      name: "Lena Müller",
      phoneE164: "+4915123456789",
      phoneValid: true,
      email: "lena@example.com",
      whatsappConsent: true,
      whatsappConsentText: consent.text,
    });
    expect(mapped.whatsappConsentAt?.toISOString()).toBe("2026-03-29T00:30:00.000Z");
  });

  it("falls back to first and last name", () => {
    const mapped = mapMetaLead(
      lead({
        field_data: [
          { name: "first_name", values: ["Jonas"] },
          { name: "last_name", values: ["Weber"] },
        ],
      }),
      consent,
      "DE",
    );
    expect(mapped.name).toBe("Jonas Weber");
    expect(mapped.phoneValid).toBe(false);
    expect(mapped.email).toBeNull();
  });

  it("stores no consent when the checkbox is unchecked", () => {
    const mapped = mapMetaLead(
      lead({ custom_disclaimer_responses: [{ checkbox_key: "whatsapp_consent", is_checked: "" }] }),
      consent,
      "DE",
    );
    expect(mapped.whatsappConsent).toBe(false);
    expect(mapped.whatsappConsentAt).toBeNull();
    expect(mapped.whatsappConsentText).toBeNull();
  });
});

describe("hasConsent", () => {
  it("never assumes consent without a configured key", () => {
    expect(hasConsent(lead(), null)).toBe(false);
  });

  it("ignores other checkboxes", () => {
    expect(
      hasConsent(
        lead({ custom_disclaimer_responses: [{ checkbox_key: "newsletter", is_checked: "1" }] }),
        "whatsapp_consent",
      ),
    ).toBe(false);
  });

  it("accepts a form question with the configured key as fallback", () => {
    expect(
      hasConsent(
        lead({
          custom_disclaimer_responses: [],
          field_data: [{ name: "whatsapp_consent", values: ["Ja"] }],
        }),
        "whatsapp_consent",
      ),
    ).toBe(true);
  });
});
