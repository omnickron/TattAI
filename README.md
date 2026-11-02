# TattAI – Leads & Beratungstermine

Interne Web-App (PWA) für das Tattoo-Studio: Leads aus Meta-Lead-Formularen, WhatsApp-Erstansprache,
faire Verteilung von Beratungsterminen auf die Tätowierer, Google-Kalender, Umsatz-Auswertung.
Spezifikation und verbindliche Entscheidungen: [`CLAUDE.md`](CLAUDE.md).

**Stand: Phase 1 (Fundament)** – Login, Tätowierer-Verwaltung, Lead-Eingang per Meta-Webhook, Leadliste.

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

## Befehle

| Befehl | Zweck |
| --- | --- |
| `npm run dev` | Entwicklungsserver |
| `npm test` | Testdatenbank migrieren + alle Tests |
| `npm run typecheck` / `npm run lint` | Typprüfung / Linting |
| `npm run db:migrate` | Neue Migration erzeugen/anwenden |
| `npm run db:seed` | Beispieldaten einspielen (mehrfach ausführbar) |
| `npm run jobs:webhooks` | Fehlgeschlagene Lead-Abrufe erneut versuchen |

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

## Produktion (Vorschlag: Hetzner Cloud)

1. Server anlegen (z. B. CX22, Standort Nürnberg/Falkenstein, Ubuntu), Docker installieren,
   DNS-Eintrag (A-Record) für die App-Domain auf den Server setzen.
2. Repository auf den Server holen, `.env` aus `.env.example` erstellen und den Abschnitt
   „Production only“ ausfüllen (u. a. `POSTGRES_PASSWORD`, `APP_DOMAIN`, `DEV_LOGIN_ENABLED=false`).
3. Starten: `docker compose -f deploy/docker-compose.prod.yml --env-file .env up -d --build`
   (Migrationen laufen automatisch, Caddy holt das HTTPS-Zertifikat).
4. Backups: Hetzner-Snapshots aktivieren und `deploy/backup.sh` per Cron täglich ausführen.

Google-Login (sobald der Workspace existiert): In der Google Cloud Console ein OAuth-Projekt mit
Zustimmungsbildschirm „Intern“ anlegen, Redirect-URI `https://<domain>/api/auth/callback/google`,
dann `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` und `GOOGLE_WORKSPACE_DOMAIN` setzen.
