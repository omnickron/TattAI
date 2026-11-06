import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge, Button, ButtonLink, Card, CardTitle, Input, Select, cn } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { createTeamupClient } from "@/lib/google/client";
import { isCalendarMock } from "@/lib/google/mock-calendar";
import { prisma } from "@/lib/db";
import { loadTeamupConfig } from "@/lib/teamup/config";
import { isTeamupMock, teamupConfigured, WHO_FIELD, type TeamupField } from "@/lib/teamup/teamup";
import {
  connectTeamupAction,
  disconnectGoogleCalendar,
  disconnectTeamupAction,
  switchToGoogleAction,
} from "./actions";

type Profile = {
  calendarProvider: "GOOGLE" | "TEAMUP";
  googleConnectedAt: Date | null;
  googleAccountEmail: string | null;
  teamupConnectedAt: Date | null;
  teamupArtist: string | null;
  teamupArtistLabel: string | null;
  teamupSubcalendarId: string | null;
  teamupSubcalendarName: string | null;
};

const GOOGLE_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google-Kalender verbunden – deine Termine laufen über Google." },
  denied: { ok: false, text: "Verbindung abgebrochen. Ohne Kalender bekommst du keine Termine." },
  scopes: {
    ok: false,
    text: "Es wurden nicht alle Berechtigungen erteilt. Bitte erneut verbinden und alle Häkchen setzen.",
  },
  account: {
    ok: false,
    text: "Bitte mit demselben Google-Konto verbinden, mit dem du dich anmeldest.",
  },
  error: {
    ok: false,
    text: "Die Verbindung mit Google ist fehlgeschlagen. Bitte erneut versuchen.",
  },
};

/** Calendar of the tattooer: Google (own account) or TeamUp (shared studio calendar). */
export async function CalendarCard({
  profile,
  userName,
  isAdmin,
  tab,
  googleResult,
}: {
  profile: Profile;
  userName: string;
  isAdmin: boolean;
  tab: string | undefined;
  googleResult: string | undefined;
}) {
  const active = profile.calendarProvider;
  const shown: "GOOGLE" | "TEAMUP" =
    tab === "teamup" ? "TEAMUP" : tab === "google" ? "GOOGLE" : active;
  const googleConnected = Boolean(profile.googleConnectedAt);
  const teamupConnected = Boolean(profile.teamupConnectedAt);
  const inUseConnected = active === "TEAMUP" ? teamupConnected : googleConnected;
  const googleMessage = googleResult ? GOOGLE_MESSAGES[googleResult] : null;

  return (
    <Card>
      <CardTitle
        action={
          inUseConnected ? (
            <Badge tone="green">{active === "TEAMUP" ? "TeamUp" : "Google"} aktiv</Badge>
          ) : (
            <Badge tone="amber">nicht verbunden</Badge>
          )
        }
      >
        Kalender
      </CardTitle>
      <div
        role="tablist"
        aria-label="Kalender-Anbieter"
        className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm"
      >
        {(["GOOGLE", "TEAMUP"] as const).map((p) => (
          <Link
            key={p}
            role="tab"
            aria-selected={shown === p}
            href={`/availability?kalender=${p === "GOOGLE" ? "google" : "teamup"}`}
            scroll={false}
            className={cn(
              "rounded-md px-3 py-1.5 text-center font-medium",
              shown === p ? "bg-surface shadow-sm" : "text-ink-soft hover:text-ink",
            )}
          >
            {p === "GOOGLE" ? "Google Kalender" : "TeamUp"}
            {active === p && inUseConnected && " ✓"}
          </Link>
        ))}
      </div>

      {googleMessage && shown === "GOOGLE" && (
        <p
          role="status"
          className={
            googleMessage.ok
              ? "mb-3 text-sm text-emerald-700 dark:text-emerald-400"
              : "mb-3 text-sm text-red-600"
          }
        >
          {googleMessage.text}
        </p>
      )}

      {shown === "GOOGLE" ? (
        <GooglePanel profile={profile} />
      ) : (
        <TeamupPanel profile={profile} userName={userName} isAdmin={isAdmin} />
      )}
    </Card>
  );
}

function GooglePanel({ profile }: { profile: Profile }) {
  const connected = Boolean(profile.googleConnectedAt);
  const inUse = profile.calendarProvider === "GOOGLE";
  return (
    <div className="space-y-3 text-sm">
      {connected ? (
        <p className="text-ink-soft">
          Verbunden
          {profile.googleAccountEmail && (
            <>
              {" "}
              als <span className="text-ink">{profile.googleAccountEmail}</span>
            </>
          )}{" "}
          seit {formatDateTime(profile.googleConnectedAt)}. Belegte Zeiten aus allen deinen
          Kalendern werden berücksichtigt. Beratungen und Tattoo-Termine landen im Kalender
          „Studio-Termine“, den die App beim Verbinden anlegt.
        </p>
      ) : (
        <p className="text-ink-soft">
          Verbinde deinen eigenen Google-Kalender. Die App sieht nur, wann du belegt bist – nicht,
          was in deinen Terminen steht.
        </p>
      )}
      {connected && !inUse && (
        <ActionForm action={switchToGoogleAction}>
          <p className="text-ink-soft">
            Gerade laufen deine Termine über TeamUp. Beim Wechsel ziehen anstehende Termine in
            Google um.
          </p>
          <Button type="submit">Google verwenden</Button>
        </ActionForm>
      )}
      {connected && inUse ? (
        <ActionForm
          action={disconnectGoogleCalendar}
          confirm="Kalender wirklich trennen? Du bekommst dann keine neuen Termine."
        >
          <Button type="submit" variant="secondary">
            Verbindung trennen
          </Button>
        </ActionForm>
      ) : (
        !connected && (
          <ButtonLink href="/api/google/connect" prefetch={false}>
            Google-Kalender verbinden
          </ButtonLink>
        )
      )}
      {isCalendarMock() && (
        <p className="text-xs text-ink-soft">
          Beispiel-Modus: Es wird kein echter Google-Kalender verwendet (Mittagspause und einzelne
          private Termine werden simuliert).
        </p>
      )}
    </div>
  );
}

async function TeamupPanel({
  profile,
  userName,
  isAdmin,
}: {
  profile: Profile;
  userName: string;
  isAdmin: boolean;
}) {
  const cfg = await loadTeamupConfig(prisma);
  if (!teamupConfigured(cfg)) {
    return (
      <div className="space-y-3 text-sm text-ink-soft">
        <p>
          Bei TeamUp teilt sich das Studio einen gemeinsamen Kalender. Deine Termine erkennt die App
          am Feld „Artist“.
        </p>
        <p className="rounded-lg border border-dashed border-line p-3">
          TeamUp ist noch nicht eingerichtet.{" "}
          {isAdmin ? (
            <Link href="/admin/settings#teamup" className="font-medium text-ink underline">
              Jetzt in den Einstellungen einrichten
            </Link>
          ) : (
            "Der Admin muss es zuerst in den Einstellungen verbinden."
          )}
        </p>
      </div>
    );
  }

  let field: TeamupField | null = null;
  let loadError: string | null = null;
  let whoNames: string[] = [];
  let subcalendars: Array<{ id: string; name: string }> = [];
  try {
    const client = createTeamupClient();
    subcalendars = await client.listSubcalendars();
    const fields = await client.listFields();
    field = fields.find((f) => f.id === cfg.artistFieldId) ?? null;
    if (cfg.artistFieldId === WHO_FIELD) whoNames = await client.recentWhoValues().catch(() => []);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }
  const inUse = profile.calendarProvider === "TEAMUP" && Boolean(profile.teamupConnectedAt);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink-soft">
        Gemeinsamer Studio-Kalender: Du bist belegt, wenn in deinem Unterkalender ein Termin steht
        oder irgendwo einer mit deinem Namen. Beratungen und Tattoo-Termine aus der App landen in
        deinem Unterkalender, mit deinem Namen.
      </p>
      {inUse && (
        <p>
          Verbunden als Artist{" "}
          <span className="font-medium">„{profile.teamupArtistLabel ?? profile.teamupArtist}“</span>
          {profile.teamupSubcalendarName && (
            <>
              {" "}
              im Unterkalender{" "}
              <span className="font-medium">„{profile.teamupSubcalendarName}“</span>
            </>
          )}{" "}
          seit {formatDateTime(profile.teamupConnectedAt)}.
        </p>
      )}
      {loadError ? (
        <p className="text-red-600">TeamUp ist gerade nicht erreichbar: {loadError}</p>
      ) : (
        <ActionForm action={connectTeamupAction}>
          <label className="block space-y-1.5">
            <span className="font-medium">Dein Artist{field ? ` (Feld „${field.name}“)` : ""}</span>
            {field?.choices ? (
              <Select name="artist" defaultValue={profile.teamupArtist ?? ""} required>
                <option value="" disabled>
                  Bitte auswählen …
                </option>
                {field.choices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                name="artist"
                defaultValue={profile.teamupArtist ?? userName}
                required
                maxLength={100}
                placeholder="Name wie in TeamUp (Feld „Wer“ bzw. „Künstler“)"
                list="teamup-who-names"
              />
            )}
            {whoNames.length > 0 && (
              <datalist id="teamup-who-names">
                {whoNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            )}
            {cfg.artistFieldId === WHO_FIELD && (
              <span className="block text-xs text-ink-soft">
                Genau so geschrieben, wie er in TeamUp im eingebauten Feld steht (bei euch evtl.
                „Künstler“).
              </span>
            )}
          </label>
          <label className="block space-y-1.5">
            <span className="font-medium">Dein Unterkalender</span>
            <Select
              name="subcalendar"
              defaultValue={
                profile.teamupSubcalendarId ??
                guessSubcalendar(subcalendars, [
                  profile.teamupArtistLabel,
                  profile.teamupArtist,
                  userName,
                ])
              }
            >
              <option value="">Standard aus den Einstellungen</option>
              {subcalendars.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <span className="block text-xs text-ink-soft">
              Hier landen deine Termine aus der App.
            </span>
          </label>
          <Button type="submit">{inUse ? "Speichern" : "TeamUp verwenden"}</Button>
          {!inUse && profile.calendarProvider === "GOOGLE" && profile.googleConnectedAt && (
            <p className="text-xs text-ink-soft">
              Anstehende Termine ziehen von Google in TeamUp um.
            </p>
          )}
        </ActionForm>
      )}
      {inUse && (
        <ActionForm
          action={disconnectTeamupAction}
          confirm="TeamUp wirklich trennen? Ohne Kalender bekommst du keine neuen Termine."
        >
          <Button type="submit" variant="secondary">
            TeamUp trennen
          </Button>
        </ActionForm>
      )}
      {isTeamupMock() && (
        <p className="text-xs text-ink-soft">
          Beispiel-Modus: Es wird kein echter TeamUp-Kalender verwendet (belegte Zeiten werden
          simuliert).
        </p>
      )}
    </div>
  );
}

/** Pre-selects the sub-calendar named like the tattooer (e.g. "Nico", "Nick Ink"). */
function guessSubcalendar(
  subs: Array<{ id: string; name: string }>,
  names: Array<string | null | undefined>,
): string {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  for (const raw of names) {
    const n = raw ? norm(raw) : "";
    if (!n) continue;
    const exact = subs.find((s) => norm(s.name) === n);
    if (exact) return exact.id;
    const first = norm(raw!.split(/\s+/)[0]);
    const byFirst = subs.find((s) => norm(s.name.split(/\s+/)[0]) === first);
    if (byFirst) return byFirst.id;
  }
  return "";
}
