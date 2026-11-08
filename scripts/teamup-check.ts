/**
 * Checks the real TeamUp connection step by step (no secrets in the output).
 *
 *   npm run teamup:check                                    – read only: sub-calendars, fields, events
 *   npm run teamup:check -- --write <subcalendarId> <fieldId> <artist>
 *                                                           – also creates, changes and deletes a test entry
 */
import "dotenv/config";
import { createPrismaClient } from "../src/lib/prisma-client";
import { refreshIntegrationSettings } from "../src/lib/integrations/store";
import {
  normalizeCalendarKey,
  TeamupClient,
  WHO_FIELD,
  type TeamupConfig,
} from "../src/lib/teamup/teamup";
import { setting } from "../src/lib/integrations/store";

const TZ = process.env.APP_TIMEZONE || "Europe/Berlin";

function step(title: string) {
  console.log(`\n── ${title}`);
}

async function main() {
  // Keys maintained in the app take precedence over the .env
  const db = createPrismaClient();
  await refreshIntegrationSettings(db).catch(() => undefined);
  await db.$disconnect();
  const apiKey = setting("TEAMUP_API_KEY");
  const calendarKey = normalizeCalendarKey(setting("TEAMUP_CALENDAR_KEY"));
  if (!apiKey || !calendarKey) {
    console.log(
      "TeamUp-Zugang fehlt (Betreiber → Zugänge oder TEAMUP_API_KEY/TEAMUP_CALENDAR_KEY in der .env).",
    );
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const write = args[0] === "--write";
  const [subcalendarId, fieldId, artist] = write ? args.slice(1) : [];
  const cfg: TeamupConfig = {
    apiKey,
    calendarKey,
    subcalendarId: subcalendarId ?? null,
    artistFieldId: fieldId ?? null,
  };
  const client = new TeamupClient(async () => cfg, TZ);

  step("1. Unterkalender");
  const subs = await client.listSubcalendars();
  for (const s of subs) console.log(`   ${s.id}  ${s.name}`);

  step("2. Felder (mögliche Artist-Felder)");
  const fields = await client.listFields();
  for (const f of fields) {
    console.log(
      `   ${f.id}  ${f.name}${f.choices ? ` – Auswahl: ${f.choices.map((c) => `${c.id}=${c.name}`).join(", ")}` : ""}`,
    );
  }
  const raw = await client
    .request<unknown>("/field-definitions")
    .catch((e) =>
      String(e.message).includes("403")
        ? "eigene Felder nur mit Admin-Link lesbar – NEEDL nutzt dann das eingebaute Feld („Wer“, evtl. umbenannt z. B. in „Künstler“)"
        : `Fehler: ${e.message}`,
    );
  console.log(
    "   Eigene Felder:",
    typeof raw === "string" ? raw : JSON.stringify(raw).slice(0, 600),
  );

  step("3. Einträge der nächsten 7 Tage (Feldwerte, keine Inhalte)");
  const from = new Date();
  const to = new Date(from.getTime() + 7 * 86_400_000);
  const events = await client.listEvents(from, to);
  console.log(`   ${events.length} Einträge`);
  for (const e of events.slice(0, 5)) {
    console.log(
      `   id=${e.id} start=${e.start_dt} all_day=${Boolean(e.all_day)} subcal=${JSON.stringify(e.subcalendar_ids)} who=${JSON.stringify(e.who ?? null)} custom=${JSON.stringify(e.custom ?? null)} remote_id=${JSON.stringify(e.remote_id ?? null)}`,
    );
  }

  if (!write) {
    console.log(
      "\nNur gelesen. Schreibtest: npm run teamup:check -- --write <Unterkalender-ID> <Feld-ID> <Artist>",
    );
    return;
  }

  step(`4. Schreibtest in Unterkalender ${subcalendarId}, Feld ${fieldId}, Artist ${artist}`);
  if (!subcalendarId || !fieldId || !artist)
    throw new Error("Bitte Unterkalender-ID, Feld-ID und Artist angeben.");
  const conn = {
    tattooerId: "teamup-check",
    provider: "TEAMUP" as const,
    teamupArtist: artist,
    refreshTokenEnc: null,
    calendarId: `teamup:${subcalendarId}`,
  };
  const start = new Date(Date.now() + 2 * 86_400_000);
  start.setUTCHours(9, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  const input = {
    summary: "NEEDL Testeintrag (wird gleich gelöscht)",
    description: "Test der Verbindung\nhttps://app.needl-booker.de",
    start,
    end,
    timeZone: TZ,
  };
  const id = await client.createEvent(conn, conn.calendarId, input);
  console.log(`   angelegt: ${id}`);
  const busy = await client.getBusy(conn, start, end);
  console.log(`   als belegt gezählt: ${busy.length} (erwartet 0 – App-Einträge zählen nicht)`);
  await client.updateEvent(conn, conn.calendarId, id, {
    ...input,
    summary: "NEEDL Testeintrag (geändert)",
  });
  console.log("   geändert: ok");
  await client.deleteEvent(conn, conn.calendarId, id);
  console.log("   gelöscht: ok");
  if (fieldId === WHO_FIELD) console.log("   (Artist über das eingebaute Feld „Wer“/„Künstler“)");
  console.log("\nAlles erfolgreich.");
}

const HINTS: Array<[RegExp, string]> = [
  [
    /TeamUp 404/,
    "Der Kalender-Schlüssel (TEAMUP_CALENDAR_KEY) ist unbekannt. Er muss aus einem Freigabe-Link stammen (TeamUp-Einstellungen → Sharing, Berechtigung „Modify“), meist beginnt er mit „ks“. Der Schlüssel aus der Adresszeile beim Öffnen über dein Konto funktioniert nicht.",
  ],
  [
    /TeamUp 401/,
    "Der API-Schlüssel (TEAMUP_API_KEY) wird nicht akzeptiert. Bitte prüfen oder neu erzeugen.",
  ],
  [
    /TeamUp 403/,
    "Der Freigabe-Link hat zu wenige Rechte. Für NEEDL braucht er „Modify“ für die betroffenen Unterkalender.",
  ],
];

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nFEHLER: ${message}`);
  const hint = HINTS.find(([re]) => re.test(message));
  if (hint) console.error(`\nHinweis: ${hint[1]}`);
  console.error(`(Geprüfter Kalender-Schlüssel: ${maskedKey()})`);
  process.exit(1);
});

/** First and last characters only – never the whole key. */
function maskedKey() {
  const k = normalizeCalendarKey(setting("TEAMUP_CALENDAR_KEY")) ?? "";
  return k.length > 6 ? `${k.slice(0, 3)}…${k.slice(-2)} (${k.length} Zeichen)` : "(zu kurz)";
}
