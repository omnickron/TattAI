/**
 * The studio knowledge the WhatsApp bot answers from. Maintained by the admin on the
 * "Bot" page; turned into the knowledge part of the bot's system prompt.
 */

export type QA = { q: string; a: string };

export interface KnowledgeLinks {
  website?: string;
  instagram?: string;
  impressum?: string;
  datenschutz?: string;
}

export interface Knowledge {
  assistantName: string | null;
  about: string | null;
  team: string | null;
  location: string | null;
  openingHours: string | null;
  services: string | null;
  process: string | null;
  customerConcerns: string | null;
  toneExamples: string | null;
  forbiddenWords: string | null;
  noGos: string | null;
  links: KnowledgeLinks;
  faq: QA[];
  objections: QA[];
}

export type TextField = Exclude<keyof Knowledge, "links" | "faq" | "objections">;

export interface FieldDef {
  name: TextField;
  label: string;
  hint?: string;
  placeholder?: string;
  rows?: number;
  max: number;
  optional?: boolean;
}

export interface SectionDef {
  key: string;
  title: string;
  intro: string;
  fields?: FieldDef[];
  /** List sections (question → answer) */
  list?: "faq" | "objections";
  links?: boolean;
}

/** The sections of the "Bot" page, in the order the bot needs them. */
export const SECTIONS: SectionDef[] = [
  {
    key: "studio",
    title: "Studio & Team",
    intro: "Wer ihr seid – so stellt der Bot das Studio vor.",
    fields: [
      {
        name: "assistantName",
        label: "Name im Chat",
        hint: "Wie der Bot unterschreibt, z. B. „Mia vom Black Rose Team“. Leer = ohne Namen.",
        placeholder: "Mia vom Black Rose Team",
        rows: 1,
        max: 80,
        optional: true,
      },
      {
        name: "about",
        label: "Über das Studio",
        hint: "Was macht ihr, seit wann, wofür steht ihr? 2–4 Sätze.",
        placeholder: "Wir sind ein privates Studio in Berlin-Mitte, seit 2015, spezialisiert auf …",
        max: 1500,
      },
      {
        name: "team",
        label: "Team",
        hint: "Nur Vornamen und Stile, die genannt werden dürfen. Eine Zeile pro Person.",
        placeholder: "Kim – Fineline, Blumen\nAlex – Realistic, Black & Grey",
        max: 1500,
      },
    ],
  },
  {
    key: "location",
    title: "Standort & Erreichbarkeit",
    intro: "Wo ihr seid und wann ihr erreichbar seid.",
    fields: [
      {
        name: "location",
        label: "Adresse & Anfahrt",
        placeholder: "Musterstraße 12, 10115 Berlin – U-Bahn Rosenthaler Platz, Parken schwierig",
        max: 800,
      },
      {
        name: "openingHours",
        label: "Öffnungszeiten",
        placeholder: "Di–Sa 11–19 Uhr, nur mit Termin",
        rows: 2,
        max: 500,
      },
    ],
  },
  {
    key: "services",
    title: "Leistungen & Stile",
    intro: "Was ihr stecht – und was nicht. Ohne Preise.",
    fields: [
      {
        name: "services",
        label: "Leistungen",
        hint: "Pro Leistung 1–3 Sätze: was der Kunde davon hat. Auch: was ihr nicht macht.",
        placeholder:
          "Fineline & Blumen – zarte Linien, ideal fürs erste Tattoo\nCover-ups – nur nach Beratung mit Foto\nKeine Gesichts-Tattoos",
        rows: 6,
        max: 3000,
      },
    ],
  },
  {
    key: "process",
    title: "Ablauf",
    intro: "Was nach der Anfrage passiert – der Bot erklärt das und führt zur Beratung.",
    fields: [
      {
        name: "process",
        label: "Von der Anfrage bis zum Tattoo",
        hint: "Beratung (vor Ort oder Telefon), Entwurf, Anzahlung, Termin, Nachsorge – wie läuft es bei euch?",
        placeholder:
          "1. Kostenlose Beratung (30 Min.) vor Ort, bei weiter Anreise per Telefon\n2. Entwurf …\n3. Termin …",
        rows: 6,
        max: 3000,
      },
    ],
  },
  {
    key: "faq",
    title: "Häufige Fragen",
    intro: "20–30 Fragen, die Kunden wirklich stellen – mit euren echten Antworten.",
    list: "faq",
  },
  {
    key: "objections",
    title: "Einwände",
    intro: "Typische Bedenken und wie ihr darauf antwortet (ohne Preise).",
    list: "objections",
  },
  {
    key: "concerns",
    title: "Typische Anliegen",
    intro: "Was eure Kunden beschäftigt – der Bot spricht das aktiv an.",
    fields: [
      {
        name: "customerConcerns",
        label: "Typische Anliegen und Sorgen",
        hint: "3–5 Punkte, eine Zeile pro Punkt.",
        placeholder:
          "Erstes Tattoo, Angst vor Schmerzen\nAltes Tattoo soll überdeckt werden\nUnsicher bei Motiv oder Stelle",
        max: 1500,
      },
    ],
  },
  {
    key: "tone",
    title: "Ton",
    intro: "Wie ihr schreibt – der Bot übernimmt euren Stil.",
    fields: [
      {
        name: "toneExamples",
        label: "Beispielsätze",
        hint: "5–10 Sätze, so wie ihr selbst Kunden auf WhatsApp schreibt.",
        placeholder: "Hey! Mega Idee 🙌 Erzähl mal, wo soll’s hin?\nKein Stress, schau in Ruhe …",
        rows: 6,
        max: 2000,
      },
      {
        name: "forbiddenWords",
        label: "Wörter, die nie fallen dürfen",
        placeholder: "günstig, Rabatt, Schnäppchen",
        rows: 2,
        max: 500,
        optional: true,
      },
    ],
  },
  {
    key: "nogos",
    title: "No-Gos",
    intro: "Themen, zu denen der Bot nichts sagt, und Zusagen, die er nie macht.",
    fields: [
      {
        name: "noGos",
        label: "No-Gos",
        placeholder:
          "Keine Aussagen zu Konkurrenz-Studios\nKeine Zusage zu Terminen ohne Buchung\nKeine Ferndiagnosen zu Haut oder Narben",
        rows: 4,
        max: 1500,
      },
    ],
  },
  {
    key: "links",
    title: "Links",
    intro: "Nur diese Links darf der Bot verschicken.",
    links: true,
  },
];

export const LINK_FIELDS: Array<{ key: keyof KnowledgeLinks; label: string; placeholder: string }> =
  [
    { key: "website", label: "Website", placeholder: "https://black-rose-tattoo.de" },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/blackrose" },
    { key: "impressum", label: "Impressum", placeholder: "https://black-rose-tattoo.de/impressum" },
    {
      key: "datenschutz",
      label: "Datenschutz",
      placeholder: "https://black-rose-tattoo.de/datenschutz",
    },
  ];

/** Rules that always apply and cannot be changed on the page. */
export const FIXED_RULES = [
  "Nennt nie Preise, Schätzungen oder Preisrahmen – der Preis wird in der Beratung geklärt.",
  "Kein KI-Hinweis von sich aus; auf Nachfrage: „Manche Nachrichten werden durch eine KI automatisiert.“ Gibt sich nie als Mensch aus.",
  "Fragt nicht nach Gesundheit (Allergien, Hautkrankheiten, Medikamente, Schwangerschaft) und speichert so etwas nicht.",
  "Fragt nie nach dem Alter (wird persönlich geklärt).",
  "Bucht nur Termine, die NEEDL wirklich frei meldet, und sagt „gebucht“ erst nach erfolgreicher Buchung.",
  "Erfindet nichts: Was nicht in diesem Wissen steht, wird nicht behauptet.",
];

const PRICE_RE =
  /(\d[\d.,]*\s?(€|eur\b|euro)|€\s?\d|\b(ab|ca\.?|circa|etwa|rund|zwischen)\s+\d[\d.,]*\s*(€|eur|euro)?|\bpreis(e|rahmen)?\s*(:|liegt|beginnt|startet|ab)\s*\d)/i;

/** Finds price-like mentions (the bot never quotes prices – they don't belong in the knowledge). */
export function priceMentions(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const line of text.split("\n")) {
    const m = PRICE_RE.exec(line);
    if (m) found.push(line.trim().slice(0, 80));
  }
  return found;
}

const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "";
  return s ? s.slice(0, max) : null;
};

export function parseQAList(value: unknown, maxItems = 60): QA[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => ({
      q: clean((x as QA)?.q, 300) ?? "",
      a: clean((x as QA)?.a, 1500) ?? "",
    }))
    .filter((x) => x.q && x.a)
    .slice(0, maxItems);
}

export function parseLinks(value: unknown): KnowledgeLinks {
  const v = (value ?? {}) as Record<string, unknown>;
  const out: KnowledgeLinks = {};
  for (const { key } of LINK_FIELDS) {
    const s = clean(v[key], 300);
    if (s && /^https:\/\/[^\s]+$/i.test(s)) out[key] = s;
  }
  return out;
}

export function emptyKnowledge(): Knowledge {
  return {
    assistantName: null,
    about: null,
    team: null,
    location: null,
    openingHours: null,
    services: null,
    process: null,
    customerConcerns: null,
    toneExamples: null,
    forbiddenWords: null,
    noGos: null,
    links: {},
    faq: [],
    objections: [],
  };
}

/** DB row → knowledge (tolerant of missing/invalid JSON). */
export function toKnowledge(row: Record<string, unknown> | null): Knowledge {
  if (!row) return emptyKnowledge();
  const k = emptyKnowledge();
  for (const s of SECTIONS) for (const f of s.fields ?? []) k[f.name] = clean(row[f.name], f.max);
  k.links = parseLinks(row.links);
  k.faq = parseQAList(row.faq);
  k.objections = parseQAList(row.objections);
  return k;
}

/** Is a section filled well enough for the bot? */
export function sectionDone(section: SectionDef, k: Knowledge): boolean {
  if (section.list === "faq") return k.faq.length >= 5;
  if (section.list === "objections") return k.objections.length >= 2;
  if (section.links) return Boolean(k.links.website);
  return (section.fields ?? []).filter((f) => !f.optional).every((f) => Boolean(k[f.name]));
}

/** All price-like mentions in the knowledge, with where they are. */
export function knowledgePriceWarnings(k: Knowledge): string[] {
  const out: string[] = [];
  for (const s of SECTIONS) {
    for (const f of s.fields ?? [])
      for (const m of priceMentions(k[f.name])) out.push(`${f.label}: „${m}“`);
  }
  for (const [list, label] of [
    [k.faq, "Häufige Fragen"],
    [k.objections, "Einwände"],
  ] as const)
    for (const qa of list) for (const m of priceMentions(qa.a)) out.push(`${label}: „${m}“`);
  return out;
}
