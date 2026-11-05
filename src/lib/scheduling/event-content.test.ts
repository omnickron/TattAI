import { describe, expect, it } from "vitest";
import { buildConsultationEvent, buildTattooEvent } from "./event-content";

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

describe("buildTattooEvent", () => {
  const session = {
    lead: base.lead,
    sessionNumber: 2,
    multipleSessions: true,
    slot: { start: base.start, end: base.end },
    localDate: "2026-11-09",
    nextLocalDate: "2026-11-10",
    studioAddress: base.studioAddress,
    note: null,
    appUrl: base.appUrl,
    timeZone: base.timeZone,
  };

  it("puts motif and price at the top of the notes", () => {
    const e = buildTattooEvent({ ...session, amountCents: 45000, totalCents: 90000 });
    const [first, second] = e.description.split("\n");
    expect(first).toBe("Motiv: Rose mit Schriftzug");
    expect(second).toMatch(/^Preis: 450,00\s€ \(gesamt 900,00\s€\)$/);
  });

  it("says when no price is entered yet", () => {
    const e = buildTattooEvent({ ...session, multipleSessions: false, amountCents: null });
    expect(e.description).toContain("Preis: noch nicht eingetragen");
  });

  it("shows the motif for consultations, too", () => {
    const e = buildConsultationEvent({ ...base, mode: "ON_SITE" });
    expect(e.description.split("\n")[0]).toBe("Motiv: Rose mit Schriftzug");
    const open = buildConsultationEvent({
      ...base,
      lead: { ...base.lead, tattooSummary: null },
      mode: "ON_SITE",
    });
    expect(open.description.split("\n")[0]).toBe("Motiv: noch offen");
  });
});
