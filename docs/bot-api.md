# Bot-Schnittstelle (API v1)

Schnittstelle zwischen TattAI und dem WhatsApp-Chatbot. Der Bot selbst ist nicht Teil dieses Projekts.
TattAI bleibt die Quelle der Wahrheit für Leads und Termine; der Bot liest und schreibt nur über diese API.

## Überblick

```
Kunde ──WhatsApp──► Meta ──Webhook──► TattAI ──signiertes Ereignis──► Bot
                                        ▲                              │
                                        └──────── Bot-API (REST) ◄─────┘
```

1. Eine Kundennachricht kommt bei TattAI an und wird im Chatverlauf gespeichert.
2. Ist der Bot in diesem Chat aktiv, schickt TattAI das Ereignis `message.received` an `BOT_WEBHOOK_URL`.
3. Der Bot antwortet über `POST /leads/{id}/messages`, fragt freie Zeiten ab, bucht usw.

## Wann der Bot nicht handeln darf

Der Bot ist in einem Chat **aus**, wenn

- ein Mensch (Tätowierer/Admin) im Chat geantwortet hat (Übernahme – bleibt aus, bis jemand ihn wieder einschaltet),
- jemand den Schalter „Bot“ auf der Lead-Seite ausgeschaltet hat,
- der Hauptschalter im Admin („Bot überall ausschalten“) aus ist,
- der Kunde sich abgemeldet hat (Opt-out, z. B. „STOP“).

Dann gilt:

- TattAI schickt **keine** `message.received`-Ereignisse mehr für diesen Chat (auch bereits geplante werden verworfen).
- Alle schreibenden Aufrufe für diesen Chat antworten mit **409 `BOT_DISABLED`**.
- `GET /leads/{id}` zeigt `botActive: false` und `botDisabledReason`.

Ereignisse `chat.bot_disabled` und `chat.bot_enabled` informieren den Bot über Änderungen, damit er laufende
Abläufe abbricht bzw. wieder aufnimmt.

## Authentifizierung

Jeder Aufruf braucht den Header

```
Authorization: Bearer <BOT_API_KEY>
```

`BOT_API_KEY` wird in TattAI als Umgebungsvariable gesetzt (mindestens 32 Zeichen, z. B. `openssl rand -hex 32`).
Ohne gültigen Schlüssel: `401`; ist die API nicht eingerichtet: `503`.

Basis-URL: `https://<app-domain>/api/bot/v1`

## Antworten und Fehler

Erfolg: `200` mit `{ "data": … }`. Fehler: `{ "error": { "code": "…", "message": "…" } }`.

| Status | Code | Bedeutung |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | API-Schlüssel fehlt/falsch |
| 404 | `LEAD_NOT_FOUND`, `NOT_FOUND` | Lead bzw. Termin unbekannt |
| 409 | `BOT_DISABLED` | Bot ist in diesem Chat aus – nichts tun |
| 409 | `NO_TATTOOER_FREE`, `SLOT_TAKEN` | Zeit nicht (mehr) frei – neue Slots abfragen |
| 409 | `ALREADY_BOOKED` | Lead hat schon einen Termin – umbuchen statt neu buchen |
| 409 | `WINDOW_CLOSED` | 24-Stunden-Fenster geschlossen – keine freie Nachricht möglich |
| 409 | `OPT_OUT`, `INVALID_STATE` | Kunde abgemeldet bzw. Termin nicht änderbar |
| 422 | `VALIDATION_ERROR`, `INVALID_PHONE` | Eingabe ungültig |
| 502 | `CALENDAR_FAILED`, `SEND_FAILED` | Google bzw. WhatsApp hat abgelehnt – nichts wurde geändert |

Zeitangaben sind ISO-8601 in UTC (z. B. `2026-11-09T09:00:00.000Z`); Darstellung für Kunden in Europe/Berlin.

## Endpunkte

### `GET /slots?from=&to=`

Freie Beratungs-Startzeiten über alle Tätowierer. Standard: ab jetzt 14 Tage, höchstens 28 Tage im Voraus,
frühestens 2 Stunden ab jetzt. Welcher Tätowierer den Termin bekommt, entscheidet TattAI beim Buchen (fair).

```json
{ "data": { "from": "…", "to": "…", "slots": [
  { "start": "2026-11-09T09:00:00.000Z", "end": "2026-11-09T09:30:00.000Z", "available": 2 }
] } }
```

### `GET /leads?phone=+4915112345678`

Lead zu einer WhatsApp-Nummer (gleiche Antwort wie `GET /leads/{id}`).

### `GET /leads/{id}`

```json
{ "data": {
  "id": "…", "name": "Lena Müller", "firstName": "Lena", "phone": "+49…", "email": null,
  "status": "IN_CHAT", "botActive": true, "botDisabledReason": null,
  "replyWindowOpenUntil": "2026-11-10T08:00:00.000Z",
  "tattooSummary": { "motif": "Rose", "…": "…" },
  "upcomingConsultation": { "id": "…", "startsAt": "…", "endsAt": "…", "mode": "ON_SITE", "tattooerFirstName": "Alex" },
  "attachments": [ { "id": "…", "mimeType": "image/jpeg", "caption": "So ungefähr", "createdAt": "…" } ],
  "recentMessages": [ { "id": "…", "from": "customer", "text": "Hallo", "sentAt": "…" } ]
} }
```

`from`: `customer`, `bot`, `human` (Tätowierer/Admin) oder `automatic` (Template-Nachricht).

### `POST /leads/{id}/messages`

Freie Antwort an den Kunden – nur innerhalb von 24 Stunden nach seiner letzten Nachricht.

```json
{ "text": "Hallo Lena, magst du mir kurz beschreiben, was du dir vorstellst?" }
```

### `POST /leads/{id}/consultations`

Bucht einen Beratungstermin. TattAI wählt fair unter allen, die zu dieser Zeit frei sind, legt den
Kalendereintrag an und setzt den Lead auf „Termin gebucht“.

```json
{ "startsAt": "2026-11-09T09:00:00.000Z", "mode": "ON_SITE" }
```

`mode`: `ON_SITE` (vor Ort, Standard) oder `PHONE` (Kunde kann nicht anreisen).

### `PATCH /consultations/{id}`

Umbuchen. Ist der bisherige Tätowierer zur neuen Zeit frei, bleibt er; sonst wird fair neu vergeben
(dann ändert sich die Termin-ID – die Antwort enthält die neue).

```json
{ "startsAt": "2026-11-10T14:00:00.000Z" }
```

### `DELETE /consultations/{id}`

Sagt den Termin ab und entfernt den Kalendereintrag.

### `PUT /leads/{id}/tattoo-summary`

Strukturierte Zusammenfassung der Tattoo-Idee. Erscheint am Lead in der App und im Kalendereintrag
(bestehende Einträge werden aktualisiert). Alle Felder optional, unbekannte Felder werden abgelehnt.

```json
{
  "motif": "Rose mit Schriftzug",
  "placement": "Unterarm innen",
  "size": "ca. 10 × 6 cm",
  "style": "Fineline",
  "color": "black_grey",
  "coverUp": false,
  "referenceAttachmentIds": ["…"],
  "timeframe": "im Frühjahr",
  "notes": "Schriftzug: Name der Tochter"
}
```

`color`: `color` oder `black_grey`. `referenceAttachmentIds`: IDs aus `attachments` bzw. aus `message.received`.

## Ereignisse an den Bot (Webhook)

TattAI sendet `POST` an `BOT_WEBHOOK_URL`:

```
Content-Type: application/json
X-TattAI-Event: message.received
X-TattAI-Delivery: <id>          # gleich bei Wiederholungen → zum Entdoppeln verwenden
X-TattAI-Timestamp: 1793701234   # Unix-Sekunden
X-TattAI-Signature: sha256=<hex HMAC-SHA256(BOT_WEBHOOK_SECRET, "<timestamp>.<body>")>
```

Der Bot muss die Signatur prüfen (zeitkonstant vergleichen) und Ereignisse älter als einige Minuten
verwerfen. Antwortet er nicht mit `2xx`, wiederholt TattAI die Zustellung mit wachsendem Abstand
(1, 2, 4 … bis 60 Minuten, höchstens 10 Versuche).

```json
{ "id": "<delivery-id>", "event": "message.received", "createdAt": "…",
  "data": { "event": "message.received", "leadId": "…",
            "message": { "id": "…", "type": "text", "text": "Hallo!", "attachmentIds": [], "sentAt": "…" } } }
```

| Ereignis | Bedeutung |
| --- | --- |
| `message.received` | Neue Kundennachricht (nur wenn der Bot im Chat aktiv ist) |
| `chat.bot_disabled` | Bot in diesem Chat aus (`reason`: `HUMAN_TAKEOVER` oder `MANUAL`) |
| `chat.bot_enabled` | Bot in diesem Chat wieder an |

Bilder und Dokumente des Kunden kommen als `type: "image"`/`"document"` mit `attachmentIds`. Die Dateien
selbst liegen privat in TattAI und sind nur für Admin und zuständigen Tätowierer abrufbar.
