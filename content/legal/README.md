# Rechtstexte für needl-booker.de – Vorlagen

**Stand:** Entwurf vom 10.11.2026. **Keine Rechtsberatung.** Diese Texte sind Vorlagen, die auf
dem tatsächlichen Funktionsumfang von NEEDL beruhen. Sie müssen vor der Veröffentlichung von
einer Anwältin oder einem Anwalt (IT-/Datenschutzrecht) geprüft und ergänzt werden.

## Dateien

| Datei | Seite | Wofür |
| --- | --- | --- |
| `impressum.md` | /impressum | Pflicht nach § 5 DDG, § 18 MStV |
| `datenschutz.md` | /datenschutz | Website, Plattform, Daten aus Meta (von Meta als „Privacy Policy URL“ verlangt) |
| `nutzungsbedingungen.md` | /nutzungsbedingungen | Regeln für alle, die NEEDL nutzen (von Meta als „Terms of Service URL“ verlangt) |
| `agb.md` | /agb | Vertrag zwischen NEEDL und dem Studio (Leistung, Provision, Haftung, Laufzeit) |
| `datenloeschung.md` | /datenloeschung | Anleitung zur Datenlöschung (von Meta als „Data Deletion Instructions URL“ verlangt) |

## Platzhalter

Alle Stellen in `[[doppelten eckigen Klammern]]` müssen ersetzt werden, vor allem:

- `[[Name/Firma]]`, `[[Rechtsform]]`, `[[Anschrift]]`, `[[Vertretungsberechtigte Person]]`
- `[[Registergericht, HRB]]` (nur bei GmbH/UG) bzw. streichen
- `[[USt-IdNr.]]` oder Hinweis auf Kleinunternehmerregelung (§ 19 UStG)
- `[[Telefon]]`, E-Mail (Vorschlag: info@needl-booker.de, datenschutz@needl-booker.de)
- `[[Serverstandort]]` (IONOS-Rechenzentrum, z. B. Deutschland)
- `[[Datum]]` (Stand der Fassung)
- `[[Provision in %]]` (derzeit in NEEDL voreingestellt: 15 % zzgl. USt.)

## Für die Prüfung: offene Fragen

1. **Rollen nach DSGVO:** Die Vorlagen gehen davon aus, dass NEEDL für die Daten der Kundinnen
   und Kunden des Studios **Auftragsverarbeiter** (Art. 28 DSGVO) ist und das Studio der
   Verantwortliche. Für Website, Vertragsabwicklung, Abrechnung und Sicherheit ist NEEDL selbst
   Verantwortlicher. Bitte bestätigen lassen.
2. **Auftragsverarbeitungsvertrag (AVV):** Die AGB verweisen auf einen AVV mit dem Studio.
   Dieser fehlt noch (inkl. Liste der Unterauftragsverarbeiter und TOMs).
3. **Anthropic (USA):** Übermittlung von Chat-Inhalten an Anthropic zur Erzeugung der
   Bot-Antworten. Rechtsgrundlage für den Drittlandtransfer (Standardvertragsklauseln bzw.
   EU-US Data Privacy Framework) und aktuelle Vertragsgesellschaft prüfen.
4. **KI-Transparenz:** Der Bot weist nur auf Nachfrage auf die Automatisierung hin. Pflichten
   nach Art. 50 KI-Verordnung (ab 02.08.2026 anwendbar) prüfen, ggf. Hinweis im Erstkontakt.
5. **Einwilligungstext** im Meta-Formular und Werbung per WhatsApp (§ 7 UWG) prüfen.
6. **Haftungsbegrenzung, Provisionsmodell, Kündigungsfristen** in den AGB an das tatsächliche
   Angebot anpassen.
7. **Datenschutzhinweise des Studios:** Das Studio braucht eigene Datenschutzhinweise für seine
   Kundinnen und Kunden (Lead-Formular, WhatsApp). NEEDL kann dafür einen Baustein liefern.
