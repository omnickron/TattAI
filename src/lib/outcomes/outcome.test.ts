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
    expect(validateOutcome({ outcome: "HELD", tattoo: "OPEN" })).toMatchObject({
      tattoo: "OPEN",
      sessions: [],
    });
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
      { date: "2026-12-01", amountCents: 60000 },
      { date: "2027-01-12", amountCents: null },
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
    ).toThrow("Betrag");
  });
});
