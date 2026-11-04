import { ActionForm } from "@/components/action-form";
import { Badge, Button, Card, CardTitle, Field, Select } from "@/components/ui";
import { prisma } from "@/lib/db";
import { createTeamupClient } from "@/lib/google/client";
import { teamupCredentialsPresent } from "@/lib/teamup/config";
import { isTeamupMock, type TeamupField, type TeamupSubcalendar } from "@/lib/teamup/teamup";
import { updateTeamupSettings } from "./actions";

/** Admin: connect the studio's shared TeamUp calendar. */
export async function TeamupCard() {
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const mock = isTeamupMock();
  const credentials = teamupCredentialsPresent();
  let subcalendars: TeamupSubcalendar[] = [];
  let fields: TeamupField[] = [];
  let error: string | null = null;
  if (credentials) {
    try {
      const client = createTeamupClient();
      [subcalendars, fields] = await Promise.all([client.listSubcalendars(), client.listFields()]);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
  const users = await prisma.tattooerProfile.findMany({
    where: { calendarProvider: "TEAMUP", teamupConnectedAt: { not: null } },
    select: { teamupArtistLabel: true, teamupArtist: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const ready = Boolean(
    credentials && settings?.teamupSubcalendarId && settings.teamupArtistFieldId,
  );

  return (
    <Card id="teamup">
      <CardTitle
        action={
          mock ? (
            <Badge tone="amber">Beispieldaten</Badge>
          ) : ready ? (
            <Badge tone="green">eingerichtet</Badge>
          ) : (
            <Badge tone="gray">nicht eingerichtet</Badge>
          )
        }
      >
        TeamUp-Kalender
      </CardTitle>
      <p className="mb-4 text-sm text-ink-soft">
        Alternative zu Google: Das Studio teilt sich einen TeamUp-Kalender. Jeder Tätowierer wählt
        unter „Verfügbarkeit“, ob er Google oder TeamUp nutzt, und welcher Wert im Artist-Feld zu
        ihm gehört.
      </p>

      {!credentials ? (
        <div className="space-y-2 rounded-lg border border-dashed border-line p-3 text-sm text-ink-soft">
          <p>
            Zugangsdaten fehlen. Sie werden aus Sicherheitsgründen nur als Umgebungsvariablen auf
            dem Server hinterlegt:
          </p>
          <ul className="list-inside list-disc font-mono text-xs">
            <li>TEAMUP_API_KEY</li>
            <li>TEAMUP_CALENDAR_KEY</li>
          </ul>
          <p>Danach die App neu starten.</p>
        </div>
      ) : error ? (
        <p className="text-sm text-red-600">TeamUp ist nicht erreichbar: {error}</p>
      ) : (
        <ActionForm action={updateTeamupSettings}>
          <Field
            label="Unterkalender für App-Termine"
            htmlFor="teamupSubcalendarId"
            hint="Hier trägt die App Beratungen und Tattoo-Termine ein."
          >
            <Select
              id="teamupSubcalendarId"
              name="teamupSubcalendarId"
              defaultValue={settings?.teamupSubcalendarId ?? ""}
              required
            >
              <option value="" disabled>
                Bitte auswählen …
              </option>
              {subcalendars.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Artist-Feld"
            htmlFor="teamupArtistFieldId"
            hint="Das Pflichtfeld, das festhält, wem ein Termin gehört."
          >
            <Select
              id="teamupArtistFieldId"
              name="teamupArtistFieldId"
              defaultValue={settings?.teamupArtistFieldId ?? ""}
              required
            >
              <option value="" disabled>
                Bitte auswählen …
              </option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.choices ? ` (${f.choices.length} Auswahlwerte)` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit">Speichern</Button>
        </ActionForm>
      )}

      {users.length > 0 && (
        <div className="mt-5 text-sm">
          <h3 className="mb-2 font-semibold">Nutzen TeamUp</h3>
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.user.name} className="flex justify-between py-1.5">
                <span>{u.user.name}</span>
                <span className="text-ink-soft">
                  Artist „{u.teamupArtistLabel ?? u.teamupArtist}“
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
