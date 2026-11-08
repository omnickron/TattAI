# Projekt: Lead- und Beratungstermin-App für das Tattoo-Studio

## Ziel

Web-App, die Kunden über Meta-Werbung (Lead-Formulare) gewinnt, automatisch per WhatsApp anschreibt, über einen Chatbot Beratungstermine bucht, diese fair auf die Tätowierer verteilt, in den Google-Kalender einträgt und am Ende auswertbar macht, wie viel Umsatz aus den Leads entsteht.

Sprache der Oberfläche und aller Texte für Nutzer: Deutsch. Code, Variablen und Kommentare: Englisch.

## Kontext und Rahmen

- Nutzung nur intern, 3 bis 7 Tätowierer, 1 Admin (der Studio-Inhaber).
- Erwartet werden ca. 100 bis 150 Leads pro Woche.
- Es gibt keine Empfangskraft: Jeder Tätowierer führt seine Beratungen selbst durch und bucht sie für sich.
- Kapazität ist vorerst kein Thema der App. Die von den Tätowierern freigegebenen Zeiten werden einfach gefüllt.
- Der WhatsApp-Chatbot wird direkt in NEEDL gebaut (Entscheidung vom 05.11.2026, vorher außerhalb geplant): Claude (Anthropic API) als Gehirn im Hintergrunddienst, Gedächtnis und Regeln aus NEEDL, kein Make. Ziel: Tattoo-Idee klären und Beratungstermin buchen. Anrede „du“. Übergabe an Menschen mit Meldung in der App und per Push-Benachrichtigung. Die Bot-Schnittstelle (API) bleibt für andere Anbindungen bestehen. Der Bot nennt NIE Preise, Schätzungen oder Preisrahmen (Preis klärt die Beratung). Kein aktiver KI-Hinweis; nur auf Nachfrage: „Manche Nachrichten werden durch eine KI automatisiert.“ Er gibt sich nie als Mensch aus. (Transparenzpflicht nach EU-KI-Verordnung Art. 50 vor Livegang rechtlich prüfen lassen.)

## Entscheidungen (verbindlich)

- Web-App, mobil nutzbar als installierbare Web-App (PWA), keine native App.
- Zwei Rollen: Admin und Tätowierer.
- Login mit Google-Konto (Google Workspace des Studios, App als "intern" betreiben, damit keine Google-Verifizierung nötig ist).
- Lead-Quelle: Meta Instant-Formular (Lead Ads). Felder: Name, Telefonnummer, optional E-Mail. Kein Click-to-WhatsApp.
- Das Tattoo-Anliegen wird nicht im Formular, sondern vom Chatbot im WhatsApp-Chat geklärt.
- Keine Altersabfrage in der App oder im Chat (wird persönlich geklärt).
- Kalender: Google Kalender oder TeamUp, pro Tätowierer wählbar. Bei TeamUp teilt sich das Studio einen Kalender; jeder Tätowierer hat dort seinen eigenen Unterkalender (in NEEDL wählbar), und das eingebaute Feld (im Studio „Künstler“ genannt) hält fest, wem ein Termin gehört. NEEDL braucht dafür nur einen Freigabe-Link mit „Modify“, keine Admin-Rechte (Entscheidung vom 06.11.2026). Login bleibt Google.
- Tattoo-Umsatz wird manuell in der App erfasst. Es gibt keine Kassensoftware.
- Die App ist die Quelle der Wahrheit für Leads und Termine, Google Kalender wird synchronisiert.

## Rollen und Rechte

**Admin**
- Sieht alle Leads, Termine, Tätowierer und Auswertungen.
- Legt Tätowierer an, deaktiviert sie, setzt Soll-Anteile (Fairness).
- Kann Termine umverteilen und Leads manuell bearbeiten.

**Betreiber** (Anbieter von NEEDL, Entscheidung vom 05.11.2026)
- Vorerst keine eigene Rolle, sondern ein Admin mit der E-Mail aus `OPERATOR_EMAIL` (Server-Umgebung).
- Eigener Menüpunkt „Betreiber“: Bot-Betrieb (Kosten, Kostenlimits, Antwort-Grenzen, Fehler, Pause), Rechnungsdaten (Provision, Steuer, Absender), Rechnungen erstellen und verwalten.
- Der Studio-Admin pflegt das Bot-Wissen, sieht den Bot-Status ohne Kosten, schaltet den Bot über die WhatsApp-Einstellungen bzw. pro Chat und sieht seine Rechnungen.

**Tätowierer**
- Pflegt eigene Verfügbarkeiten für Beratungen (wiederkehrend und Ausnahmen wie Urlaub).
- Stellt die Beratungsdauer und optional einen Puffer zwischen Terminen selbst ein.
- Verbindet den eigenen Google-Kalender.
- Sieht nur die eigenen Beratungen und die zugehörigen Leads.
- Trägt nach der Beratung das Ergebnis ein und ob ein Tattoo-Termin daraus wurde (inkl. Betrag und Datum).

## Kernfunktionen

### 1. Lead-Eingang (Meta)
- Webhook für `leadgen`-Events (Signatur prüfen), danach Lead-Details per Graph API abrufen.
- Idempotent: Jeder Lead (Meta-Lead-ID) wird nur einmal angelegt.
- Telefonnummer ins internationale Format (E.164) normalisieren, ungültige Nummern markieren.
- Kampagne, Anzeigengruppe und Anzeige am Lead mitspeichern (für spätere Auswertung der Kosten pro Lead).

### 2. Automatische WhatsApp-Erstansprache
- WhatsApp Cloud API (eigener WhatsApp-Business-Account nur für dieses Projekt).
- Erstkontakt nur mit vorab von Meta genehmigten Templates. Freie Nachrichten nur im 24-Stunden-Fenster nach Antwort des Kunden.
- Das Formular muss eine Einwilligung für den WhatsApp-Kontakt enthalten, die am Lead gespeichert wird (Zeitstempel und Wortlaut).
- Erinnerungen vor dem Termin (z. B. 24 h und 2 h vorher) per Template.
- Eingehende und ausgehende Nachrichten werden pro Lead gespeichert.

### 3. Chatbot-Schnittstelle (Bot selbst ist außerhalb des Projekts)
Der spätere Bot spricht mit der App über eine geschützte API (API-Key):
- Verfügbare Beratungszeiträume abfragen.
- Einen Termin für einen Lead buchen. Das Backend entscheidet fair, welcher Tätowierer den Termin bekommt.
- Eine strukturierte Zusammenfassung der Tattoo-Idee am Lead speichern: Motiv, Körperstelle, Größe, Stil, Farbe oder schwarz-grau, Cover-up ja/nein, Referenzbilder, Zeitrahmen, Sonstiges.
- Termin umbuchen oder absagen.
Die Zusammenfassung erscheint am Lead in der App UND im Beschreibungsfeld des Kalendereintrags.

### 4. Verfügbarkeit und Buchung
- Verfügbare Zeiten aus den Verfügbarkeitsregeln des Tätowierers MINUS belegte Zeiten im Google Kalender (Free/Busy über alle Kalender der Person).
- Beratungstermine und Tattoo-Termine werden in einen eigenen Kalender "Studio-Termine" des Tätowierers geschrieben (wird beim Verbinden automatisch angelegt).
- Buchung transaktional und gegen Doppelbuchung gesichert (Lock oder Transaktion), erst DB, dann Kalender-Event, bei Fehler sauber zurückrollen.

### 5. Faire Verteilung mit einstellbaren Anteilen
- Admin-Ansicht: automatisch erzeugte Liste aller aktiven Tätowierer, daneben jeweils ein Soll-Anteil in Prozent. Die Summe wird automatisch auf 100 % normiert. Tätowierer, die seltener da sind, bekommen einen kleineren Anteil.
- Auswertungszeitraum einstellbar (Standard: rollierend 4 Wochen).
- Algorithmus pro neuem Termin: Unter allen Tätowierern, die zum gewünschten Zeitpunkt frei sind, gewinnt die Person mit dem größten Rückstand (Soll-Anteil mal Gesamtzahl der Termine im Zeitraum minus eigene bisherige Termine). Bei Gleichstand: Zufall oder die Person mit dem ältesten letzten Termin.
- Die Logik liegt in einem eigenen, gut getesteten Modul (Unit-Tests mit mehreren Szenarien).
- Später (nicht jetzt): Gewichtung nach Stil und Spezialisierung.

### 6. Kundenübersicht und Kalender in der App
- Leadliste mit Status, Filter und Suche.
- Eigener Kalender in der App (Tag, Woche), zeigt Beratungstermine, Admin sieht alle, Tätowierer die eigenen.
- Lead-Detailseite: Kontaktdaten, Chatverlauf, Tattoo-Zusammenfassung, Termine, Notizen.

### 7. Umsatz-Tracking
- Nach der Beratung trägt der Tätowierer ein: Beratung stattgefunden / No-Show / abgesagt, und ob ein Tattoo-Termin daraus wurde.
- Für Tattoo-Termine: Datum, geplanter Preis und Anzahlung (manuell). Nach dem Termin: erschienen ja/nein und Endpreis. Umsatz = Endpreis; nach einem No-Show zählt die Anzahlung als Umsatz, auch für die Provision (Entscheidung vom 08.11.2026).
- Auswertung für den Admin: Leads, gebuchte Beratungen, stattgefundene Beratungen, Tattoo-Abschlüsse, Umsatz, je Zeitraum, Kampagne und Tätowierer.
- Später: Werbekosten aus Meta importieren (Kosten pro Lead, ROI) und Abschlüsse an Meta zurückmelden (Conversions API).

## Lead-Status (Vorschlag)
`neu` → `kontaktiert` → `im_chat` → `termin_gebucht` → `beratung_erfolgt` → `tattoo_gebucht` | `kein_tattoo` | `no_show` | `abgesagt` | `keine_antwort` | `ungueltig`

## Datenmodell (Grobentwurf)
User (Rolle), TattooerProfile (Google-Verbindung, Beratungsdauer, Puffer), AvailabilityRule und AvailabilityException, Lead (Quelle, Kampagne, Einwilligung, Status, Tattoo-Zusammenfassung), Message, Consultation (Lead, Tätowierer, Start, Ende, Kalender-Event-ID, Ergebnis), TattooBooking (Consultation, Datum, Betrag), FairnessConfig (Zeitraum) und FairnessShare (Tätowierer, Anteil).

## Technische Leitplanken
- Vorschlag: TypeScript durchgängig, Next.js (App Router) mit PostgreSQL und Prisma, Hintergrundjobs für Erinnerungen und Retries. Alternativen sind in Ordnung, wenn sie begründet werden.
- Hosting in der EU (DSGVO).
- Secrets: Grundlagen (Datenbank, Anmelde-Geheimnis, Verschlüsselungs-Schlüssel, Google-Login, Anthropic, Push) nur in Umgebungsvariablen. Zugänge von TeamUp, WhatsApp und Meta pflegt der Betreiber in der App (Betreiber → Zugänge): verschlüsselt gespeichert (AES-256-GCM), nie wieder angezeigt, Änderungen protokolliert, .env als Rückfall (Entscheidung vom 07.11.2026). Google-Refresh-Tokens verschlüsselt speichern.
- Alle Webhooks: Signatur prüfen, idempotent verarbeiten, Fehler protokollieren, Retries.
- Zeitzone: Europe/Berlin, in der Datenbank UTC speichern. Sommer-/Winterzeit in Tests abdecken.
- Tests für Fairness-Logik, Slot-Berechnung und Webhook-Idempotenz sind Pflicht.

## Datenschutz (DSGVO)
- Einwilligung für WhatsApp-Kontakt speichern. Löschkonzept: Leads ohne Beratung/Termin werden 10 Monate nach der letzten Aktivität automatisch gelöscht (Entscheidung vom 07.11.2026); einzelne Leads löscht der Admin von Hand.
- Beratungsformen: vor Ort und telefonisch, in den Einstellungen pflegbar; Beratung kostenlos (Entscheidung vom 06.11.2026).
- Auftragsverarbeitungsverträge mit Google (Workspace), Meta und dem Hosting-Anbieter.
- Kalendereinträge enthalten Kundendaten: Zugriff nur für den zuständigen Tätowierer und den Admin.
- Referenzbilder von Kunden sicher speichern (privater Speicher, keine öffentlichen Links).

## Phasen

1. **Fundament:** Projekt-Setup, Datenbank, Login (Admin/Tätowierer), Tätowierer-Verwaltung, Lead-Eingang per Meta-Webhook, Leadliste.
2. **Termine:** Verfügbarkeiten, Beratungsdauer, Google-Kalender-Anbindung (Free/Busy und Event schreiben), Fairness-Verteilung mit Admin-Einstellung, App-Kalender.
3. **WhatsApp und Bot-Schnittstelle:** Templates, Erstansprache, Erinnerungen, Chatverlauf, API für den späteren Chatbot (Slots, Buchen, Zusammenfassung speichern).
4. **Auswertung:** Beratungsergebnis, Tattoo-Abschluss und Umsatz, Dashboard für den Admin.

Nach jeder Phase lauffähigen Stand liefern, bevor die nächste beginnt.

## Spätere Ideen (nicht jetzt umsetzen)
- Echte dritte Rolle „Betreiber“ über mehrere Studios hinweg (erst bei Umbau auf mehrere Studios pro Installation).
- Ad-Budget bei Meta automatisch drosseln, wenn alle Slots belegt sind.
- Verteilung nach Stil und Spezialisierung.
- Meta-Kosten importieren (ROI) und Conversions API.
- Warteliste, wenn keine Slots frei sind.

## Offene Punkte
- Zeitplan für Erstansprache und Nachfassen bei fehlender Antwort.
- Texte der WhatsApp-Templates und Einwilligungstext im Formular.

## Arbeitsweise für Claude Code
- Vor größeren Schritten kurz den Plan nennen und auf Rückfragen hinweisen, statt bei Unklarheit zu raten.
- Kleine, überprüfbare Schritte, regelmäßig committen.
- Entscheidungen aus diesem Dokument nicht ohne Rücksprache ändern.
