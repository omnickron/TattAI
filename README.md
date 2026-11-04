# NEEDL – Leads & Beratungstermine

Interne Web-App (PWA) für das Tattoo-Studio: Leads aus Meta-Lead-Formularen, WhatsApp-Erstansprache,
faire Verteilung von Beratungsterminen auf die Tätowierer, Google-Kalender, Umsatz-Auswertung.
Spezifikation und verbindliche Entscheidungen: [`CLAUDE.md`](CLAUDE.md).

**Stand: Phase 4 (Auswertung) – alle vier Phasen umgesetzt**
- Phase 1: Login, Tätowierer-Verwaltung, Lead-Eingang per Meta-Webhook, Leadliste.
- Phase 2: Verfügbarkeiten, Beratungsdauer/Puffer, Google-Kalender (Free/Busy + Termine schreiben),
  faire Verteilung mit Admin-Einstellung, Buchen/Absagen/Umverteilen, App-Kalender (Tag/Woche).
- Phase 3a: WhatsApp-Erstansprache zu festen Sendezeiten mit Staffelung, Nachfassen, Erinnerungen,
  Texte (Templates) in der App pflegen und bei Meta einreichen, Chatverlauf, Antworten aus der App.
- Phase 3b: Bot-Schnittstelle (siehe [`docs/bot-api.md`](docs/bot-api.md)), Bot-Schalter pro Chat und global,
  automatische Übernahme durch Menschen, Referenzbilder im privaten Speicher.
- Phase 4: Beratungsergebnis und Tattoo-Termine (ein oder mehrere) mit Betrag, Auswertung für den Admin.

## Technik

- Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS
- PostgreSQL + Prisma 7
- Auth.js (Google-Login, beschränkt auf den Studio-Workspace) + Entwickler-Login für lokale Tests
- Vitest (Unit- und Datenbank-Integrationstests)
- Hosting-Vorschlag: Hetzner Cloud (EU) mit Docker Compose + Caddy, siehe `deploy/`

## Lokal starten

Voraussetzungen: Node.js 22, PostgreSQL 16 (oder Docker).

```bash
cp .env.example .env          # Werte anpassen, AUTH_SECRET setzen (openssl rand -base64 32)
docker compose up -d          # lokale Datenbank (alternativ eigene PostgreSQL-Instanz)
# einmalig: Testdatenbank anlegen
docker compose exec db createdb -U tattai tattai_test
npm install
npm run db:migrate            # Migrationen anwenden
npm run db:seed               # Beispieldaten: Admin, 3 Tätowierer, ~40 Leads
npm run dev                   # http://localhost:3000
```

Auf der Login-Seite gibt es lokal einen **Entwickler-Login** (Beispielnutzer auswählen). Er ist nur aktiv,
wenn `DEV_LOGIN_ENABLED=true` gesetzt ist, und in Produktions-Builds immer abgeschaltet.

### Neuen Lead simulieren

Ohne Meta-Zugang (`META_GRAPH_MOCK=true`) erzeugt die App Beispieldaten. Ein korrekt signierter Webhook
wie von Meta lässt sich so schicken (App muss laufen):

```bash
npm run dev:simulate-lead          # 1 Lead
npm run dev:simulate-lead -- 5     # 5 Leads
```

## Update holen

```bash
git pull
npm install          # nur nötig, wenn sich Abhängigkeiten geändert haben (schadet nie)
npm run db:update    # Datenbank-Migrationen + Datenbank-Client neu erzeugen
npm run dev          # erzeugt den Datenbank-Client vor dem Start ebenfalls automatisch
```

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm test` | Testdatenbank migrieren + alle Tests |
| `npm run typecheck` / `npm run lint` | Typprüfung / Linting |
| `npm run db:migrate` | Neue Migration erzeugen/anwenden |
| `npm run db:seed` | Beispieldaten einspielen (mehrfach ausführbar) |
| `npm run db:update` | Migrationen anwenden und Datenbank-Client erzeugen (nach `git pull`) |
| `npm run jobs:webhooks` | Fehlgeschlagene Lead-Abrufe erneut versuchen |
| `npm run worker` | Hintergrund-Dienst (WhatsApp-Versand, Retries) |
| `npm run dev:open-consultations` | Beispiel-Beratungen ohne Ergebnis anlegen (zum Ausprobieren) |

## Meta-Lead-Eingang

- Webhook: `POST /api/webhooks/meta` (Verifizierung per `GET` mit `META_VERIFY_TOKEN`).
- Jede Anfrage wird über `X-Hub-Signature-256` mit `META_APP_SECRET` geprüft.
- Jeder `leadgen`-Eintrag wird als `WebhookEvent` gespeichert (eindeutig je Meta-Lead-ID) und sofort
  bestätigt; die Lead-Details werden danach über die Graph API geholt. Doppelte Zustellungen werden ignoriert.
- Fehler werden am Event protokolliert und mit Backoff (1, 2, 4 … Minuten, max. 8 Versuche) wiederholt.
  Fehlgeschlagene Abrufe sind unter **Einstellungen** sichtbar.
- Telefonnummern werden ins E.164-Format gebracht. Ungültige Nummern bekommen den Status „Ungültig“.
- Die WhatsApp-Einwilligung wird über den Schlüssel des Häkchens im Formular erkannt. Schlüssel und
  Wortlaut stellt der Admin unter **Einstellungen** ein; der Wortlaut wird pro Lead mit Zeitstempel gespeichert.

## Termine und faire Verteilung

- **Verfügbarkeit** (jede Person mit Tätowierer-Profil, auch der Inhaber): wöchentliche Zeitfenster,
  Ausnahmen (Abwesenheit oder zusätzliche Zeiten), Beratungsdauer (Standard 30 Min.) und Puffer.
- **Freie Zeiten** = Zeitfenster − Abwesenheiten − belegte Zeiten aus *allen* Google-Kalendern der Person
  − bereits gebuchte Beratungen (mit Puffer). Raster 15 Minuten, frühestens 2 Stunden im Voraus
  (`src/lib/scheduling/booking.ts`, `SCHEDULING_DEFAULTS`). Ohne verbundenen Kalender gibt es keine Termine.
- **Faire Verteilung** (`src/lib/scheduling/fairness.ts`): Unter allen, die zum Zeitpunkt frei sind, gewinnt der
  größte Rückstand = Soll-Anteil × (Termine im Zeitraum + 1) − eigene Termine. Gleichstand: ältester letzter
  Termin, dann Zufall. Anteile und Zeitraum (Standard 28 Tage) stellt der Admin unter **Fairness** ein.
- **Buchung**: Transaktion mit Sperre, zusätzlich verhindert eine Datenbank-Regel überlappende Termine pro
  Person. Erst wird der Termin gespeichert, dann der Google-Eintrag im Kalender „Studio-Termine“ angelegt;
  schlägt das fehl, wird die Buchung zurückgenommen.
- **Beratungsform**: „Vor Ort“ (Standard, Studioadresse als Ort) oder „Telefon“, wenn jemand nicht anreisen kann.
- Bis der Chatbot (Phase 3) bucht, kann der Admin auf der Lead-Seite Termine buchen.
- **Eintragen im App-Kalender**: Klick auf eine freie Stelle (oder „+ Termin“) öffnet einen Dialog für
  *Beratung* (bestehender oder neuer Kontakt, Dauer aus der Einstellung der Person, auch außerhalb der
  Zeitfenster), *Tattoo* (für Kontakte mit gebuchtem Tattoo als weiterer Tattoo-Termin; oder als
  **Laufkunde ohne Beratung** – zählt in der Auswertung als Abschluss mit Umsatz, aber nicht als Beratung
  und nicht für die Fairness, auf der Lead-Seite als „Laufkunde“ markiert)
  oder *Blocker* (wird als Abwesenheit gespeichert, dort teilt der Bot keine Beratungen zu; Löschen per Klick).
  Der Admin wählt „Für wen?“, Tätowierer tragen für sich selbst ein. Geprüft wird gegen Beratungen,
  Tattoo-Termine, Blocker/Abwesenheiten und den Google-Kalender.

### Google-Kalender

Lokal läuft der Kalender im Beispiel-Modus (`GOOGLE_CALENDAR_MOCK=true`: simulierte Mittagspausen und
private Termine, Einträge werden nur protokolliert). Für den echten Betrieb:

1. Im Google-Cloud-Projekt (Zustimmungsbildschirm „Intern“) die **Google Calendar API** aktivieren.
2. Beim OAuth-Client die Redirect-URI `https://<domain>/api/google/callback` ergänzen.
3. `GOOGLE_CALENDAR_MOCK=false` und `TOKEN_ENCRYPTION_KEY` setzen (`openssl rand -base64 32`).
   Refresh-Tokens werden damit verschlüsselt gespeichert (AES-256-GCM).

Die App fragt nur diese Berechtigungen an: Free/Busy (keine Termininhalte), Kalenderliste lesen und
Verwaltung der *von der App angelegten* Kalender („Studio-Termine“, wird beim Verbinden automatisch angelegt). Einträge sind als privat markiert.

### TeamUp (Alternative zu Google)

Jeder Tätowierer wählt unter **Verfügbarkeit → Kalender**, ob seine Termine über Google oder TeamUp
laufen. Der Login bleibt Google.

- **Aufbau:** Das Studio teilt sich *einen* TeamUp-Kalender. Das Pflichtfeld **„Artist“** (Auswahlfeld
  oder das eingebaute Feld „Wer“) hält fest, wem ein Termin gehört.
- **Einrichtung (Admin):** `TEAMUP_API_KEY` und `TEAMUP_CALENDAR_KEY` als Umgebungsvariablen setzen,
  dann unter **Einstellungen → TeamUp-Kalender** den Unterkalender für App-Termine und das Artist-Feld
  wählen. Danach wählt jeder Tätowierer seinen Artist-Wert.
- **Belegt** ist eine Person, wenn im TeamUp-Kalender ein Eintrag mit ihrem Artist steht (Einträge
  der App selbst zählen nicht, erkennbar an `remote_id` mit `needl:`).
- **Beratungen und Tattoo-Termine** schreibt die App in den gewählten Unterkalender, mit dem Artist
  der Person und der Zusammenfassung als Notiz.
- **Wechsel Google ↔ TeamUp:** anstehende Termine ziehen automatisch um, die alten Einträge werden
  gelöscht. Der Google-Kalender „Studio-Termine“ wird beim Zurückwechseln wiederverwendet.
- Lokal läuft TeamUp im Beispiel-Modus (`TEAMUP_MOCK=true`).

## WhatsApp (automatischer Versand)

Alles wird im Admin unter **WhatsApp** gepflegt:

- **Sendezeiten** je Wochentag (z. B. Mo–Fr 10:00, 13:00, 17:00). Erstansprache und Nachfassen gehen nur ab
  diesen Uhrzeiten raus; Leads, die später eingehen, warten auf die nächste Sendezeit.
- **Staffelung gegen Spam-Sperren**: zufälliger Abstand zwischen zwei Nachrichten, Maximum pro Sendezeit und
  pro Tag, Aufwärmphase für eine neue Nummer (Startwert + Steigerung pro Tag).
- **Automatische Pause** bei sinkender Qualitätsbewertung, Konto-Problemen oder Spam-/Limit-Fehlern von Meta.
  Der Grund steht im Admin, fortgesetzt wird erst nach Freigabe. Zusätzlich: „Sofort pausieren“.
- **Nachfassen**: frei definierbare Schritte (z. B. nach 24 h und 72 h). Eine Antwort des Kunden stoppt sie;
  ohne Antwort wird der Lead nach der eingestellten Zeit „Keine Antwort“.
- **Erinnerungen** vor dem Termin (Standard 24 h und 2 h) – pünktlich, auch außerhalb der Sendezeiten.
- **Nach dem Termin**: Nachrichten X Stunden nach der Beratung, je nach Ergebnis (stattgefunden, Tattoo
  gebucht, Kunde überlegt, kein Tattoo, No-Show) – zu den Sendezeiten; passt das Ergebnis beim Versand nicht
  mehr, entfällt die Nachricht; mehr als 7 Tage überfällige werden nicht verschickt.
- **Texte (Templates)** im Reiter „Texte“ mit Variablen wie `{{Vorname}}`, `{{Datum}}`, `{{Uhrzeit}}`,
  `{{TattooDatum}}` (per Klick einfügbar, mit Live-Vorschau). Die App reicht sie bei
  Meta zur Prüfung ein. Änderungen werden als neue Version eingereicht (`name_v2` …); bis zur Genehmigung wird
  die bisher genehmigte Fassung verschickt.
- Nur Leads mit Einwilligung und gültiger Nummer werden angeschrieben. „STOP“/„Abmelden“ setzt ein Opt-out.
- **Antworten aus der App**: Admin und zuständiger Tätowierer können auf der Lead-Seite frei antworten; die
  Nachricht kommt beim Kunden in WhatsApp an und steht mit Absender im Chatverlauf. WhatsApp erlaubt freie
  Nachrichten nur innerhalb von 24 Stunden nach der letzten Kundennachricht – danach ist das Feld gesperrt.

Der Versand läuft im **Hintergrund-Dienst**: `npm run worker` (in Produktion der Dienst `worker` in
`deploy/docker-compose.prod.yml`). Er läuft alle 30 Sekunden und wiederholt auch fehlgeschlagene Meta-Lead-Abrufe.

Lokal (`WHATSAPP_MOCK=true`) wird nichts verschickt; Texte gelten sofort als genehmigt. Eine Kundenantwort lässt
sich simulieren: `npm run dev:simulate-whatsapp -- +4915112345678 "Hallo!"`.

Für den echten Betrieb: WhatsApp-Business-Konto und Nummer in Meta anlegen, System-User-Token mit
`whatsapp_business_messaging` und `whatsapp_business_management`, Webhook-URL `https://<domain>/api/webhooks/whatsapp`
(Felder: `messages`, `message_template_status_update`, `phone_number_quality_update`, `account_update`) und die
Variablen `WHATSAPP_*` aus `.env.example` setzen.

## Chatbot

Der Chatbot selbst ist nicht Teil des Projekts; NEEDL bietet ihm eine API (`/api/bot/v1`, API-Schlüssel) und
schickt ihm Kundennachrichten als signierte Ereignisse. Details: [`docs/bot-api.md`](docs/bot-api.md).

- **Übernahme**: Antwortet ein Mensch (Tätowierer/Admin) im Chat, schaltet sich der Bot dort dauerhaft ab.
- **Schalter pro Chat** im Chatverlauf der Lead-Seite (an/aus, mit Grund, Person und Zeitpunkt).
- **Hauptschalter** im Admin unter WhatsApp → Chatbot.
- Ist der Bot aus, bekommt er keine Nachrichten dieses Chats mehr und alle seine Aktionen werden abgelehnt.
- **Referenzbilder** der Kunden lädt der Hintergrund-Dienst in `MEDIA_STORAGE_DIR` (privat, nicht öffentlich
  erreichbar); angezeigt werden sie nur Admin und zuständigem Tätowierer. Beim Löschen eines Leads werden sie
  mitgelöscht. In Produktion liegt der Ordner im Volume `media-data`, das in Backups aufgenommen werden sollte.

## Übersicht (Startseite)

Nach dem Login öffnet sich die **Übersicht** (Admin: alles, Tätowierer: nur eigene):
offene Ergebnisse vergangener Beratungen (direkt eintragbar), die Termine des Tages als Zeitleiste
(„Jetzt“ / „Als Nächstes“), die Woche auf einen Blick (Beratungen und Tattoo-Termine pro Tag) und die
letzten fünf automatischen WhatsApp-Kontakte mit Vorschau der letzten Chatnachricht.

## Ergebnisse und Auswertung

- **Beratungen** (Navigation, Zahl = fehlende Ergebnisse): Nach Beginn einer Beratung trägt der Tätowierer (oder
  der Admin) ein, wie sie lief: *stattgefunden*, *No-Show* oder *abgesagt*. Bei *stattgefunden*: Tattoo-Termin
  vereinbart? *ja*, *nein* oder *noch offen*. Bei *ja*: *ein Termin* oder *mehrere Termine* – und bei mehreren,
  ob *nur der erste* oder *auch weitere* schon vergeben sind. Je Termin Datum, optional Uhrzeit (von–bis)
  und Betrag (später nachtragbar). Tattoo-Termine erscheinen im App-Kalender und im Google-Kalender
  der Person (derselbe Kalender wie die Beratungen; ohne Uhrzeit als ganztägiger Eintrag); mit Uhrzeit blockieren
  sie Beratungen. Änderungen und Absagen werden übertragen, Fehler wiederholt der Hintergrund-Dienst. Weitere Termine lassen sich jederzeit ergänzen, einzelne absagen; der Lead-Status
  folgt automatisch.
- **Auswertung** (Admin): Leads, gebuchte und stattgefundene Beratungen, No-Shows, Abschlüsse, Tattoo-Termine,
  Umsatz (davon bereits gestochen), Umsatz pro Lead und pro Abschluss – filterbar nach Zeitraum, Kampagne und
  Tätowierer, aufgeteilt nach Kampagne, Tätowierer und Woche/Monat.
- **Zuordnung**: Alles zählt zum Zeitraum, in dem der *Lead* eingegangen ist (auch wenn Beratung oder Tattoo
  später stattfinden). Ein Lead zählt für den Tätowierer, bei dem die Beratung stattfand (sonst der letzten
  Beratung) – Umbuchungen zählen nicht doppelt.

## Ablauf für Änderungen

1. Entwicklung auf dem Branch `claude/new-session-ti5a92`, lokal testen (`git pull`,
   `npm run db:update`, `npm run dev`).
2. Getestete Stände per Pull Request nach `main` mergen.
3. Der Server läuft auf `main`: `cd /opt/needl && bash deploy/update.sh`.

## Produktion (IONOS VPS oder anderer Ubuntu-Server)

1. **Server anlegen:** VPS mit Ubuntu 24.04, mindestens 2 vCores und 4 GB RAM, Rechenzentrum in
   Deutschland. Bei IONOS zusätzlich in der Firewall-Richtlinie des Servers die Ports 80 und 443
   freigeben (sonst kein HTTPS-Zertifikat).
2. **DNS:** A-Record der App-Adresse (z. B. `studio.needl-booker.de`) auf die IPv4 des Servers.
3. **Einrichten** (als root auf dem Server): `deploy/setup-server.sh` installiert Docker, Firewall,
   Swap, automatische Sicherheitsupdates und das tägliche Backup; es erzeugt einen Deploy-Key für
   GitHub und holt den Code nach `/opt/needl`.
4. **Konfiguration:** `bash deploy/make-env.sh` fragt Adresse, Admin und Google-Zugang ab und legt
   die `.env` mit neuen Zufallswerten an (u. a. `AUTH_URL`, ohne die Google den Login ablehnt).
5. **Starten / Aktualisieren:** `bash deploy/update.sh` (Code holen, bauen, Migrationen, Neustart;
   Caddy holt das HTTPS-Zertifikat automatisch).
6. **Google:** In der Cloud Console beim OAuth-Client zusätzlich die Weiterleitungs-URIs
   `https://<adresse>/api/auth/callback/google` und `https://<adresse>/api/google/callback` eintragen.

Google-Login (sobald der Workspace existiert): In der Google Cloud Console ein OAuth-Projekt mit
Zustimmungsbildschirm „Intern“ anlegen, Redirect-URI `https://<domain>/api/auth/callback/google`,
dann `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` und `GOOGLE_WORKSPACE_DOMAIN` setzen.
