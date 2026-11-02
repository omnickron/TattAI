import { describe, expect, it } from "vitest";
import {
  ALLOWED_VARIABLES,
  compileTemplate,
  isValidTemplateName,
  renderTemplate,
} from "./template-text";

const reminder = ALLOWED_VARIABLES.REMINDER;

describe("compileTemplate", () => {
  it("converts named to positional placeholders, reusing positions", () => {
    const r = compileTemplate(
      "Hallo {{Vorname}}, dein Termin ist am {{Datum}} um {{Uhrzeit}}. Bis bald {{Vorname}}!",
      reminder,
    );
    expect(r).toEqual({
      ok: true,
      value: {
        metaText: "Hallo {{1}}, dein Termin ist am {{2}} um {{3}}. Bis bald {{1}}!",
        variables: ["Vorname", "Datum", "Uhrzeit"],
      },
    });
  });

  it("accepts spaces inside braces", () => {
    const r = compileTemplate("Hallo {{ Vorname }}!", reminder);
    expect(r.ok && r.value.metaText).toBe("Hallo {{1}}!");
  });

  it.each([
    ["", "leer"],
    ["{{Vorname}}, hallo", "beginnen oder enden"],
    ["Hallo {{Vorname}}", "beginnen oder enden"],
    ["Hallo {{Unbekannt}}!", "Unbekannter Platzhalter"],
    ["Hallo { Vorname }} !", "geschweifte"],
    ["a\n\n\nb", "Leerzeile"],
  ])("rejects %j", (text, message) => {
    const r = compileTemplate(text, reminder);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain(message);
  });

  it("rejects appointment variables in first-contact texts", () => {
    const r = compileTemplate("Hallo, dein Termin am {{Datum}}.", ALLOWED_VARIABLES.FIRST_CONTACT);
    expect(!r.ok && r.error).toContain("nicht verfügbar");
  });
});

describe("renderTemplate", () => {
  it("fills known values and keeps unknown placeholders", () => {
    expect(renderTemplate("Hi {{Vorname}}, {{Datum}}", { Vorname: "Lena" })).toBe(
      "Hi Lena, {{Datum}}",
    );
  });
});

describe("isValidTemplateName", () => {
  it("allows lowercase, digits and underscores only", () => {
    expect(isValidTemplateName("erstkontakt_v2")).toBe(true);
    expect(isValidTemplateName("Erstkontakt")).toBe(false);
    expect(isValidTemplateName("erst-kontakt")).toBe(false);
  });
});
