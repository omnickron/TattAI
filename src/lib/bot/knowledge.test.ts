import { describe, expect, it } from "vitest";
import {
  emptyKnowledge,
  knowledgePriceWarnings,
  parseLinks,
  parseQAList,
  priceMentions,
  SECTIONS,
  sectionDone,
  toKnowledge,
} from "./knowledge";

describe("bot knowledge", () => {
  it("spots prices, estimates and ranges, but not other numbers", () => {
    for (const t of [
      "Kleine Motive ab 120 €",
      "ca. 80 Euro pro Stunde",
      "zwischen 200 und 400",
      "€90 Anzahlung",
      "Preis ab 150",
    ])
      expect(priceMentions(t)).toHaveLength(1);
    for (const t of [
      "Seit 2015 in Berlin",
      "Beratung dauert 30 Minuten",
      "Di–Sa 11–19 Uhr",
      "Musterstraße 12, 10115 Berlin",
    ])
      expect(priceMentions(t)).toEqual([]);
  });

  it("cleans lists and links", () => {
    expect(
      parseQAList([
        { q: " Tut es weh? ", a: " Kommt auf die Stelle an. " },
        { q: "leer", a: "" },
        "x",
      ]),
    ).toEqual([{ q: "Tut es weh?", a: "Kommt auf die Stelle an." }]);
    expect(
      parseLinks({
        website: "https://a.de",
        instagram: "http://insecure.de",
        impressum: "javascript:alert(1)",
      }),
    ).toEqual({
      website: "https://a.de",
    });
  });

  it("reports completeness per section and price warnings with their place", () => {
    const k = toKnowledge({
      about: "Studio",
      team: "Kim",
      faq: Array.from({ length: 5 }, (_, i) => ({
        q: `F${i}`,
        a: i === 0 ? "Ab 100 € geht's los" : "A",
      })),
    });
    const byKey = Object.fromEntries(SECTIONS.map((s) => [s.key, sectionDone(s, k)]));
    expect(byKey).toMatchObject({ studio: true, faq: true, location: false, links: false });
    expect(knowledgePriceWarnings(k)).toEqual(["Häufige Fragen: „Ab 100 € geht's los“"]);
    expect(sectionDone(SECTIONS[0], emptyKnowledge())).toBe(false);
  });
});
