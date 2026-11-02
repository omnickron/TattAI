import { describe, expect, it } from "vitest";
import { buildConsultationEvent } from "./event-content";

const base = {
  lead: {
    id: "lead1",
    name: "Lena Müller",
    phoneE164: "+4915123456789",
    email: "lena@example.com",
    tattooSummary: {
      motif: "Rose mit Schriftzug",
      placement: "Unterarm",
      color: "black_grey",
      coverUp: false,
      referenceImageCount: 2,
    },
  },
  start: new Date("2026-11-09T09:00:00Z"),
  end: new Date("2026-11-09T09:30:00Z"),
  studioAddress: "Musterstraße 1, 12345 Musterstadt",
  appUrl: "https://app.test/",
  timeZone: "Europe/Berlin",
};

describe("buildConsultationEvent", () => {
  it("builds an on-site event with tattoo summary and app link", () => {
    const e = buildConsultationEvent({ ...base, mode: "ON_SITE" });
    expect(e.summary).toBe("Beratung: Lena Müller");
    expect(e.location).toBe(base.studioAddress);
    expect(e.description).toContain("Vor Ort im Studio");
    expect(e.description).toContain("Motiv: Rose mit Schriftzug");
    expect(e.description).toContain("Farbe: schwarz-grau");
    expect(e.description).toContain("Cover-up: nein");
    expect(e.description).toContain("https://app.test/leads/lead1");
  });

  it("marks phone consultations and drops the location", () => {
    const e = buildConsultationEvent({
      ...base,
      mode: "PHONE",
      lead: { ...base.lead, tattooSummary: null },
    });
    expect(e.summary).toBe("Beratung: Lena Müller (Telefon)");
    expect(e.location).toBeNull();
    expect(e.description).toContain("Telefon – bitte Kunden anrufen");
    expect(e.description).toContain("(noch keine Zusammenfassung)");
  });
});
