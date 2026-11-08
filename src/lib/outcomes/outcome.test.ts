import { describe, expect, it } from "vitest";
import { centsToInput, formatEuro, parseEuroToCents } from "./money";
import { validateOutcome } from "./outcome";

describe("parseEuroToCents", () => {
  it.each([
    ["450", 45000],
    ["1.250,50", 125050],
    ["1250,5", 125050],
    ["1250.50", 125050],
    ["1.250", 125000],
    ["  300 € ", 30000],
    ["", null],
  ])("parses %j", (input, expected) => {
    expect(parseEuroToCents(input)).toBe(expected);
  });

  it.each(["abc", "12,345", "-5", "1,2,3"])("rejects %j", (input) => {
    expect(parseEuroToCents(input)).toBe("invalid");
  });

  it("formats", () => {
    expect(formatEuro(125050).replace(/\s/g, " ")).toBe("1.250,50 €");
    expect(centsToInput(125050)).toBe("1250,50");
  });
});

describe("validateOutcome", () => {
  const s = (date: string, amount = "") => ({ date, amount });

  it("needs no tattoo details for no-show and cancelled", () => {
    expect(validateOutcome({ outcome: "NO_SHOW", sessions: [s("2026-12-01")] })).toMatchObject({
      outcome: "NO_SHOW",
      tattoo: null,
      sessions: [],
    });
  });

  it("asks for the tattoo decision after a held consultation", () => {
    expect(() => validateOutcome({ outcome: "HELD" })).toThrow("Tattoo-Termin");
    expect(
      validateOutcome(
        { outcome: "HELD", tattoo: "OPEN", followUpDate: "2026-11-20" },
        "2026-11-09",
      ),
    ).toMatchObject({ tattoo: "OPEN", sessions: [], followUpDate: "2026-11-20" });
  });

  it("needs a follow-up day in the future when the customer is still undecided", () => {
    expect(() => validateOutcome({ outcome: "HELD", tattoo: "OPEN" })).toThrow(
      "wieder kontaktiert",
    );
    expect(() =>
      validateOutcome(
        { outcome: "HELD", tattoo: "OPEN", followUpDate: "2026-11-09" },
        "2026-11-09",
      ),
    ).toThrow("Zukunft");
    expect(
      validateOutcome({ outcome: "HELD", tattoo: "NO", followUpDate: "2026-11-20" }).followUpDate,
    ).toBeNull();
  });

  it("accepts exactly one session for a single appointment", () => {
    const v = validateOutcome({
      outcome: "HELD",
      tattoo: "YES",
      sessionPlan: "SINGLE",
      sessions: [s("2026-12-01", "450")],
    });
    expect(v).toMatchObject({
      sessionPlan: "SINGLE",
      furtherScheduled: null,
      sessions: [{ date: "2026-12-01", amountCents: 45000 }],
    });
    expect(() =>
      validateOutcome({
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [s("2026-12-01"), s("2026-12-08")],
      }),
    ).toThrow("genau einen");
  });

  it("distinguishes 'only first scheduled' from 'further scheduled'", () => {
    expect(() =>
      validateOutcome({
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "MULTIPLE",
        sessions: [s("2026-12-01")],
      }),
    ).toThrow("nur der erste");
    const first = validateOutcome({
      outcome: "HELD",
      tattoo: "YES",
      sessionPlan: "MULTIPLE",
      furtherScheduled: false,
      sessions: [s("2026-12-01", "600")],
    });
    expect(first).toMatchObject({ furtherScheduled: false, sessions: [{ amountCents: 60000 }] });
    expect(() =>
      validateOutcome({
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "MULTIPLE",
        furtherScheduled: true,
        sessions: [s("2026-12-01")],
      }),
    ).toThrow("mindestens zwei");
    const many = validateOutcome({
      outcome: "HELD",
      tattoo: "YES",
      sessionPlan: "MULTIPLE",
      furtherScheduled: true,
      sessions: [s("2026-12-01", "600"), s("2027-01-12"), s("", "")],
    });
    expect(many.sessions).toEqual([
      { date: "2026-12-01", amountCents: 60000, depositCents: null, start: null, end: null },
      { date: "2027-01-12", amountCents: null, depositCents: null, start: null, end: null },
    ]);
  });

  it("validates dates and amounts", () => {
    expect(() =>
      validateOutcome({
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [s("2026-02-30", "1")],
      }),
    ).toThrow("gültiges Datum");
    expect(() =>
      validateOutcome({
        outcome: "HELD",
        tattoo: "YES",
        sessionPlan: "SINGLE",
        sessions: [s("2026-12-01", "viel")],
      }),
    ).toThrow("Preis");
  });
});

describe("session times", () => {
  const base = { outcome: "HELD" as const, tattoo: "YES" as const, sessionPlan: "SINGLE" as const };

  it("accepts an optional time slot", () => {
    const v = validateOutcome({
      ...base,
      sessions: [{ date: "2026-12-01", start: "11:00", end: "15:30" }],
    });
    expect(v.sessions[0]).toMatchObject({ start: "11:00", end: "15:30" });
  });

  it.each([
    [{ start: "11:00" }, "Beginn und Ende"],
    [{ start: "15:00", end: "11:00" }, "nach dem Beginn"],
    [{ start: "25:00", end: "26:00" }, "ungültig"],
    [{ start: "11:10", end: "15:00" }, "Viertelstunden"],
  ])("rejects %j", (time, message) => {
    expect(() => validateOutcome({ ...base, sessions: [{ date: "2026-12-01", ...time }] })).toThrow(
      message,
    );
  });
});
