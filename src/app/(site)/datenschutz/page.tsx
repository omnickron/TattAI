import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/legal-page";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  alternates: { canonical: "/datenschutz" },
};

const PROCESSORS = [
  ["Hosting (Server, Datenbank, Dateien)", "IONOS SE, Montabaur", "Deutschland (EU)"],
  [
    "Lead-Formulare, WhatsApp Business Platform",
    "Meta Platforms Ireland Ltd., Dublin",
    "EU; Übermittlung in die USA möglich",
  ],
  ["KI für den Chatbot", "Anthropic", "USA"],
  ["Login, Google Kalender", "Google Ireland Ltd., Dublin", "EU; Übermittlung in die USA möglich"],
  ["Kalender TeamUp (falls vom Studio gewählt)", "Teamup", "Schweiz"],
  [
    "Push-Benachrichtigungen (Studio-Team)",
    "Push-Dienst des jeweiligen Browsers",
    "je nach Browser",
  ],
];

export default function DatenschutzPage() {
  return (
    <LegalPage title="Datenschutzerklärung">
      <p>
        Diese Datenschutzerklärung erklärt, welche personenbezogenen Daten auf dieser Website und in
        der Software NEEDL verarbeitet werden, wofür und auf welcher Rechtsgrundlage.
      </p>

      <h2>1. Verantwortlicher und Kontakt</h2>
      <address>
        {OPERATOR.name}
        <br />
        {OPERATOR.street}, {OPERATOR.city}
        <br />
        E-Mail: <a href={`mailto:${OPERATOR.privacyEmail}`}>{OPERATOR.privacyEmail}</a>
      </address>
      <p>
        Datenschutzbeauftragter: <Ph>falls benannt: Name und Kontakt – sonst Absatz entfernen</Ph>
      </p>

      <h2>2. Rollen: Website und Software</h2>
      <ul>
        <li>
          <strong>Website (needl-booker.de):</strong> Für die Verarbeitung beim Besuch dieser
          Website sind wir Verantwortlicher.
        </li>
        <li>
          <strong>Software NEEDL:</strong> NEEDL wird von Tattoo-Studios genutzt. Für die Daten
          ihrer Kundinnen und Kunden (Leads) ist das jeweilige Studio Verantwortlicher; wir
          verarbeiten diese Daten als Auftragsverarbeiter nach Art. 28 DSGVO auf Grundlage eines
          Auftragsverarbeitungsvertrags. <Ph>Rollenmodell rechtlich bestätigen</Ph>
        </li>
        <li>
          Für die Konten der Studio-Mitarbeitenden und die Abrechnung mit den Studios sind wir
          Verantwortlicher. <Ph>prüfen</Ph>
        </li>
      </ul>
      <p>
        Die Abschnitte 4 bis 7 beschreiben die Verarbeitung in NEEDL auch für die Studios, damit
        Betroffene an einer Stelle nachlesen können, was mit ihren Daten geschieht.
      </p>

      <h2>3. Besuch dieser Website</h2>
      <h3>3.1 Hosting und Server-Logfiles</h3>
      <p>
        Die Website und die Software werden auf Servern in Deutschland betrieben (IONOS SE,
        Elgendorfer Str. 57, 56410 Montabaur). <Ph>Anbieter und Standort bestätigen</Ph> Beim Aufruf
        werden technisch notwendige Daten verarbeitet: IP-Adresse, Datum und Uhrzeit, aufgerufene
        Seite, Browser-Typ, Referrer. Zweck ist die sichere Bereitstellung der Website;
        Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Logdaten werden nach <Ph>Anzahl</Ph> Tagen
        gelöscht.
      </p>
      <h3>3.2 Keine Cookies, kein Tracking</h3>
      <p>
        Die Website setzt keine Cookies und verwendet keine Analyse- oder Marketing-Dienste.
        Schriften werden vom eigenen Server geladen, nicht von Drittanbietern.
      </p>
      <h3>3.3 Kontakt per E-Mail</h3>
      <p>
        Wenn du uns schreibst, verarbeiten wir deine Angaben, um die Anfrage zu beantworten (Art. 6
        Abs. 1 lit. b DSGVO bei Vertragsanfragen, sonst lit. f). Wir löschen die Nachrichten, wenn
        sie erledigt sind und keine Aufbewahrungspflichten bestehen. <Ph>E-Mail-Anbieter nennen</Ph>
      </p>

      <h2>4. Verarbeitung in NEEDL: Kundinnen und Kunden der Studios</h2>
      <h3>4.1 Leads aus Meta-Werbung (Lead-Formulare)</h3>
      <p>
        Studios schalten auf Facebook und Instagram Anzeigen mit einem Lead-Formular. Wer das
        Formular absendet, übermittelt an das Studio: Name, Telefonnummer, optional E-Mail-Adresse
        sowie die Einwilligung zur Kontaktaufnahme per WhatsApp. NEEDL ruft diese Angaben über die
        Schnittstelle von Meta (Graph API) ab und speichert zusätzlich die Lead-ID, Kampagne,
        Anzeigengruppe und Anzeige sowie Zeitpunkt und Wortlaut der Einwilligung.
      </p>
      <p>
        Zweck: Kontaktaufnahme, Terminvereinbarung und Auswertung, welche Werbung zu Terminen führt.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. a und b DSGVO; für die Auswertung lit. f.{" "}
        <Ph>prüfen; ggf. gemeinsame Verantwortlichkeit von Studio und Meta für Lead Ads</Ph>
      </p>
      <h3>4.2 WhatsApp</h3>
      <p>
        Mit Einwilligung schreibt NEEDL Interessierte über die WhatsApp Business Platform (Cloud
        API) von Meta an, beantwortet Nachrichten und versendet Terminerinnerungen. Dabei werden
        Telefonnummer, Profilname, Nachrichteninhalte, gesendete Bilder und Zustellstatus
        verarbeitet und in NEEDL pro Kontakt gespeichert. Anbieter ist Meta Platforms Ireland Ltd.,
        Merrion Road, Dublin 4, Irland; eine Übermittlung an Meta Platforms, Inc. in den USA ist
        möglich (siehe Abschnitt 8). Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO, für gebuchte
        Termine lit. b. Die Einwilligung kann jederzeit widerrufen werden.
      </p>
      <h3>4.3 Chatbot mit künstlicher Intelligenz (Anthropic)</h3>
      <p>
        Nachrichten im WhatsApp-Chat können von einem Chatbot beantwortet werden, der die
        Tattoo-Idee klärt und einen Beratungstermin bucht. Dazu werden der Chatverlauf, die
        bisherige Zusammenfassung und freie Termine an das KI-Modell Claude der Anthropic
        übermittelt.{" "}
        <Ph>
          Vertragspartner (Anthropic PBC, USA, bzw. Anthropic Ireland Ltd.), Speicherdauer bei
          Anthropic und Ausschluss der Nutzung zum Training bestätigen
        </Ph>
      </p>
      <p>
        Der Chatbot nennt keine Preise und gibt sich nicht als Mensch aus; auf Nachfrage weist er
        darauf hin, dass Nachrichten durch eine KI automatisiert werden. Ein Mensch aus dem Studio
        kann das Gespräch jederzeit übernehmen. Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO.{" "}
        <Ph>Transparenzpflichten nach Art. 50 KI-Verordnung prüfen</Ph>
      </p>
      <h3>4.4 Termine und Kalender (Google, TeamUp)</h3>
      <p>
        Gebuchte Termine werden in NEEDL gespeichert und in den Kalender des Studios bzw. der
        zuständigen Person eingetragen – je nach Wahl des Studios Google Kalender (Google Ireland
        Ltd., Gordon House, Barrow Street, Dublin 4, Irland) oder TeamUp{" "}
        <Ph>Anbieter und Anschrift von TeamUp</Ph>. Der Kalendereintrag enthält Name, Telefonnummer,
        Termin und die Zusammenfassung der Tattoo-Idee. Für freie Zeiten fragt NEEDL belegte
        Zeiträume aus diesen Kalendern ab. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.
      </p>
      <h3>4.5 Beratungsergebnis und Umsatz</h3>
      <p>
        Nach der Beratung trägt das Studio das Ergebnis ein, z. B. ob ein Tattoo-Termin vereinbart
        wurde, mit Datum, Preis und Anzahlung. Zweck ist die Auswertung für das Studio und die
        Abrechnung von NEEDL. Rechtsgrundlage: Art. 6 Abs. 1 lit. b, c und f DSGVO.
      </p>

      <h2>5. Verarbeitung in NEEDL: Studio-Mitarbeitende</h2>
      <p>
        Mitarbeitende melden sich mit ihrem Google-Konto an. Verarbeitet werden Name,
        E-Mail-Adresse, Rolle, Verfügbarkeiten, verbundene Kalender und Protokolle wichtiger
        Änderungen. Zugangsdaten zu Kalendern werden verschlüsselt gespeichert. Für die Anmeldung
        wird ein technisch notwendiges Sitzungs-Cookie gesetzt (§ 25 Abs. 2 TDDDG). Wer
        Push-Benachrichtigungen einschaltet, erhält diese über den Push-Dienst seines Browsers. Die
        Verteilung von Terminen im Team erfolgt automatisch nach vom Studio festgelegten Anteilen.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. b und f DSGVO, § 26 BDSG. <Ph>prüfen</Ph>
      </p>

      <h2>6. Daten von Meta-Plattformen</h2>
      <p>
        Von Meta erhält NEEDL ausschließlich die oben beschriebenen Daten aus Lead-Formularen und
        dem WhatsApp-Chat. Wir nutzen sie nur, um für das jeweilige Studio Kontakt aufzunehmen,
        Termine zu buchen und den Erfolg der Werbung auszuwerten. Wir verkaufen diese Daten nicht
        und geben sie nicht zu Werbezwecken an Dritte weiter. Wie du die Löschung beantragst, steht
        in der <Link href="/datenloeschung">Anleitung zur Datenlöschung</Link>.
      </p>

      <h2>7. Speicherdauer</h2>
      <ul>
        <li>
          Leads ohne Beratung oder Termin werden zehn Monate nach der letzten Aktivität automatisch
          gelöscht.
        </li>
        <li>
          Leads mit Beratung oder Termin: <Ph>Frist festlegen</Ph>
        </li>
        <li>
          Konten von Mitarbeitenden: bis zur Löschung durch das Studio bzw. bis Vertragsende.{" "}
          <Ph>prüfen</Ph>
        </li>
        <li>Gesetzliche Aufbewahrungspflichten (z. B. für Rechnungen) bleiben unberührt.</li>
      </ul>

      <h2>8. Empfänger und Übermittlung in Drittländer</h2>
      <p>
        Wir setzen folgende Dienstleister ein, mit denen Auftragsverarbeitungsverträge bestehen:
      </p>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 font-medium">Zweck</th>
              <th className="py-2 pr-4 font-medium">Anbieter</th>
              <th className="py-2 font-medium">Ort</th>
            </tr>
          </thead>
          <tbody>
            {PROCESSORS.map(([purpose, provider, place]) => (
              <tr key={purpose} className="border-b border-line align-top">
                <td className="py-2 pr-4">{purpose}</td>
                <td className="py-2 pr-4">{provider}</td>
                <td className="py-2">{place}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Übermittlungen in die USA stützen sich auf den Angemessenheitsbeschluss der EU-Kommission
        zum EU-U.S. Data Privacy Framework, soweit der Empfänger zertifiziert ist, sonst auf
        Standardvertragsklauseln (Art. 46 DSGVO). Für die Schweiz besteht ein
        Angemessenheitsbeschluss. <Ph>je Anbieter prüfen</Ph>
      </p>

      <h2>9. Deine Rechte</h2>
      <p>Du hast das Recht auf</p>
      <ul>
        <li>Auskunft (Art. 15 DSGVO),</li>
        <li>Berichtigung (Art. 16 DSGVO),</li>
        <li>Löschung (Art. 17 DSGVO),</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
        <li>Datenübertragbarkeit (Art. 20 DSGVO),</li>
        <li>Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO),</li>
        <li>Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO).</li>
      </ul>
      <p>
        <strong>Widerspruchsrecht:</strong> Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f
        DSGVO kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit
        widersprechen (Art. 21 DSGVO).
      </p>
      <p>
        Bei Daten, die wir für ein Studio verarbeiten, leiten wir deine Anfrage an das Studio weiter
        und unterstützen es bei der Bearbeitung. Zuständige Aufsichtsbehörde:{" "}
        <Ph>Landesdatenschutzbehörde am Sitz des Betreibers</Ph>
      </p>

      <h2>10. Automatisierte Entscheidungen</h2>
      <p>
        Eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt.{" "}
        <Ph>prüfen (Chatbot-Buchung, automatische Terminverteilung)</Ph>
      </p>

      <h2>11. Datensicherheit</h2>
      <p>
        Verbindungen sind per TLS verschlüsselt. Zugangsdaten zu angebundenen Diensten werden
        verschlüsselt gespeichert, Bilder von Kundinnen und Kunden liegen in einem privaten Speicher
        ohne öffentliche Links. Mitarbeitende sehen nur die Daten, die sie für ihre Aufgabe
        brauchen.
      </p>

      <h2>12. Änderungen</h2>
      <p>
        Wir passen diese Datenschutzerklärung an, wenn sich die Verarbeitung oder die Rechtslage
        ändert. Es gilt die jeweils hier veröffentlichte Fassung.
      </p>
    </LegalPage>
  );
}
