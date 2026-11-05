import { describe, expect, it } from "vitest";
import { spreadSlots } from "./brain";
import { checkReply, forbiddenWordList, sentenceCount } from "./filters";
import { buildSystemPrompt } from "./prompt";
import { emptyKnowledge } from "./knowledge";
import { zonedTimeToUtc } from "../time";

const ctx = {
  allowedLinks: ["https://black-rose.de", "https://instagram.com/blackrose"],
  forbiddenWords: forbiddenWordList("günstig, Rabatt"),
  bookedThisTurn: false,
  hasUpcoming: false,
};

describe("reply filters", () => {
  it("lets normal replies through", () => {
    expect(checkReply("Mega Idee! Wo soll die Rose hin? 🌹", ctx)).toEqual([]);
    expect(checkReply("Wie wär's mit Montag um 10:00 oder 14:30?", ctx)).toEqual([]);
    expect(checkReply("Ca. 10 cm am Unterarm klingt gut.", ctx)).toEqual([]);
    expect(checkReply("Schau mal hier: https://instagram.com/blackrose/p/123", ctx)).toEqual([]);
    expect(checkReply("Mehr auf www.black-rose.de.", ctx)).toEqual([]);
  });

  it("blocks prices, foreign links, promises and forbidden words", () => {
    for (const t of [
      "Das kostet 150 €",
      "Rechne mit €200",
      "So 100-200 Euro",
      "Ab 80 Euro geht's los",
      "Preis liegt bei 300",
    ])
      expect(checkReply(t, ctx).join(" ")).toMatch(/Preis/);
    expect(checkReply("Infos auf https://example.com", ctx).join(" ")).toMatch(/nicht erlaubt/);
    expect(checkReply("https://black-rose.de.evil.com", ctx).join(" ")).toMatch(/nicht erlaubt/);
    expect(checkReply("Das klappt garantiert", ctx).join(" ")).toMatch(/Versprechen/);
    expect(checkReply("Wir sind echt günstig", ctx).join(" ")).toMatch(/verbotene Wort/);
    expect(checkReply("x".repeat(700), ctx).join(" ")).toMatch(/Zu lang/);
    expect(checkReply("Ich bin ein echter Mensch", ctx).join(" ")).toMatch(/Mensch/);
    expect(checkReply("Ich bin kein Bot", ctx).join(" ")).toMatch(/Mensch/);
  });

  it("allows 'gebucht' only with a booking", () => {
    expect(checkReply("Dein Termin ist gebucht!", ctx)).not.toEqual([]);
    expect(checkReply("Dein Termin ist gebucht!", { ...ctx, bookedThisTurn: true })).toEqual([]);
    expect(checkReply("Dein Termin ist eingetragen.", { ...ctx, hasUpcoming: true })).toEqual([]);
  });
});

describe("system prompt", () => {
  it("contains the fixed rules, the AI answer and only the allowed links", () => {
    const k = { ...emptyKnowledge(), about: "Privates Studio", links: { website: "https://a.de" } };
    const p = buildSystemPrompt(k);
    expect(p).toContain("Nenne NIE Preise");
    expect(p).toContain("Manche Nachrichten werden durch eine KI automatisiert.");
    expect(p).toContain("website: https://a.de");
    expect(p).toContain("<studio>\nPrivates Studio\n</studio>");
    expect(buildSystemPrompt(emptyKnowledge())).toContain("also gar keine Links");
  });
});

describe("slot spreading", () => {
  it("offers at most two times per day, sorted", () => {
    const starts = ["2026-11-09", "2026-11-10"].flatMap((d) =>
      [600, 615, 630, 645, 660].map((m) => zonedTimeToUtc(d, m)),
    );
    const picked = spreadSlots(starts, "Europe/Berlin", 12);
    expect(picked).toHaveLength(4);
    expect(picked[0]).toEqual(zonedTimeToUtc("2026-11-09", 600));
    expect(spreadSlots(starts, "Europe/Berlin", 3)).toHaveLength(3);
  });
});

describe("natural replies", () => {
  it("counts sentences without tripping over abbreviations, times and emojis", () => {
    expect(sentenceCount("Passt gut. Eher fein oder kräftiger?")).toBe(2);
    expect(
      sentenceCount("Z. B. ca. 10 cm am Unterarm, Termin am 12.11. um 14.30 Uhr. Passt das?"),
    ).toBe(2);
    expect(sentenceCount("Mega 🙌 Wo soll es hin?")).toBe(1);
    expect(checkReply("Eins. Zwei. Drei. Vier?", { ...ctx }).join(" ")).toMatch(/4 Sätze/);
  });

  it("tells the bot about forms and free consultation from the settings", () => {
    const k = emptyKnowledge();
    const both = buildSystemPrompt(k, { modes: ["ON_SITE", "PHONE"], free: true });
    expect(both).toContain("vor Ort im Studio; telefonisch");
    expect(both).toContain("Die Beratung ist kostenlos");
    const onSite = buildSystemPrompt(k, { modes: ["ON_SITE"], free: false });
    expect(onSite).not.toContain("telefonisch");
    expect(onSite).not.toMatch(/kostenlos/i);
    expect(onSite).toContain("Sag nichts dazu, ob die Beratung etwas kostet.");
    expect(onSite).toContain("Wiederhole oder fasse NICHT zusammen");
  });
});
