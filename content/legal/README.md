# Rechtstexte

Die Rechtstexte stehen direkt in den Seiten der Website und sind die einzige Quelle:

| Seite | Datei |
| --- | --- |
| /impressum | `src/app/(site)/impressum/page.tsx` |
| /datenschutz | `src/app/(site)/datenschutz/page.tsx` |
| /nutzungsbedingungen (zugleich Vertragsbedingungen mit den Studios) | `src/app/(site)/nutzungsbedingungen/page.tsx` |
| /datenloeschung | `src/app/(site)/datenloeschung/page.tsx` |

Anbieterdaten (Name, Anschrift, Kontakt) und der „Stand“ stehen in `src/lib/site/content.ts`.

**Stand 11.11.2026:** Alle Platzhalter sind ausgefüllt. Die Texte sind nach bestem Wissen
erstellt und keine Rechtsberatung. Vor allem diese Punkte sollte eine Anwältin oder ein Anwalt
noch prüfen:

1. Rollenmodell: Studio als Verantwortlicher, NEEDL als Auftragsverarbeiter; ggf. gemeinsame
   Verantwortlichkeit von Studio und Meta bei Lead Ads.
2. Anthropic: Vertragspartner (Anthropic Ireland, Limited), Drittlandtransfer in die USA,
   Speicherdauer und kein Training (laut Commercial Terms von Anthropic).
3. Chatbot: Transparenz nach Art. 50 KI-Verordnung (Hinweis nur auf Nachfrage), Art. 22 DSGVO.
4. Haftungsbegrenzung, Provision nach Vertragsende, Änderungsklausel in den Nutzungsbedingungen.
5. Einwilligungstext im Meta-Formular und Werbung per WhatsApp (§ 7 UWG).

Noch offen: Auftragsverarbeitungsvertrag (AVV) mit den Studios und ein Baustein für die
Datenschutzhinweise der Studios gegenüber ihren Kundinnen und Kunden.
