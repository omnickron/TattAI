/**
 * Hard checks on every bot reply before it goes out. A rejected reply is sent back to
 * the model with the reason; if it fails again, the chat is handed over to a person.
 */
import { MAX_REPLY_CHARS } from "./prompt";

export interface ReplyContext {
  allowedLinks: string[];
  forbiddenWords: string[];
  /** A consultation was booked or moved successfully in this turn */
  bookedThisTurn: boolean;
  /** The lead already has an upcoming consultation */
  hasUpcoming: boolean;
}

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>()]+)/gi;
// Amounts with currency ("150 €", "€150", "100-200 Euro") and numbers next to price words
const PRICE_RES = [
  /\d[\d.,]*\s?(€|eur\b|euro)/i,
  /€\s?\d/,
  /\b(preis\w*|kost\w*|stundensatz|anzahlung)\b[^.!?\n]{0,25}?\d/i,
];
const PROMISE_RE = /\b(garantiert|garantie|auf jeden fall möglich|100\s?%)/i;
const BOOKED_RE = /\b(gebucht|eingetragen|reserviert|steht fest|ist fix)\b/i;
const HUMAN_RE = /\bich bin (ein(e)? )?(echte[rs]? )?mensch\b|\bich bin kein(e)? (bot|ki)\b/i;

const normUrl = (u: string) =>
  u
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[.,!?;:]+$/, "")
    .replace(/\/+$/, "");

export function forbiddenWordList(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[,\n]/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length >= 3);
}

/** Problems with a reply; empty = may be sent. */
export function checkReply(text: string, ctx: ReplyContext): string[] {
  const problems: string[] = [];
  const t = text.trim();
  if (t.length > MAX_REPLY_CHARS)
    problems.push(`Zu lang (${t.length} Zeichen, höchstens ${MAX_REPLY_CHARS}). Kürzer schreiben.`);
  if (PRICE_RES.some((re) => re.test(t)))
    problems.push(
      "Enthält einen Preis oder Betrag. Nie Preise nennen – der Preis wird in der Beratung geklärt.",
    );
  const allowed = ctx.allowedLinks.map(normUrl);
  for (const m of t.matchAll(URL_RE)) {
    const u = normUrl(m[1]);
    if (!allowed.some((a) => u === a || u.startsWith(`${a}/`)))
      problems.push(`Link „${m[1]}“ ist nicht erlaubt. Nur die freigegebenen Links verwenden.`);
  }
  if (PROMISE_RE.test(t))
    problems.push("Enthält ein Versprechen („garantiert“ o. Ä.). Keine Zusagen machen.");
  const lower = t.toLowerCase();
  for (const w of ctx.forbiddenWords)
    if (lower.includes(w)) problems.push(`Enthält das verbotene Wort „${w}“.`);
  if (BOOKED_RE.test(t) && !ctx.bookedThisTurn && !ctx.hasUpcoming)
    problems.push(
      "Behauptet eine Buchung, aber es gibt keinen gebuchten Termin. Erst termin_buchen, dann bestätigen.",
    );
  if (HUMAN_RE.test(t)) problems.push("Gib dich nie als Mensch aus.");
  return problems;
}
