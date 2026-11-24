/** How a sent voice memo appears in the bot's history: what was said in it. */
export function voiceMemoText(memo: { name: string; transcript: string | null }) {
  return memo.transcript?.trim()
    ? `[Sprachnachricht] ${memo.transcript.trim()}`
    : `[Sprachnachricht „${memo.name}“ – Inhalt unbekannt]`;
}
