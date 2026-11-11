import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen",
  alternates: { canonical: "/nutzungsbedingungen" },
};

export default function NutzungsbedingungenPage() {
  return (
    <LegalPage title="Nutzungsbedingungen">
      <h2>§ 1 Geltungsbereich</h2>
      <ol>
        <li>
          Diese Bedingungen gelten für die Nutzung der Software NEEDL (im Folgenden „Dienst“), die{" "}
          {OPERATOR.name} (im Folgenden „Anbieter“) Tattoo-Studios (im Folgenden „Kunde“)
          bereitstellt.
        </li>
        <li>
          Der Dienst richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB, nicht an
          Verbraucher.
        </li>
        <li>
          Abweichende Bedingungen des Kunden gelten nur, wenn der Anbieter ihnen schriftlich
          zustimmt.
        </li>
      </ol>

      <h2>§ 2 Vertragsgegenstand</h2>
      <p>
        Der Dienst übernimmt Leads aus Meta-Lead-Formularen, spricht sie per WhatsApp an, bucht über
        einen Chatbot Beratungstermine, verteilt diese nach einstellbaren Anteilen auf die
        Mitarbeitenden, synchronisiert sie mit Google Kalender oder TeamUp und wertet Beratungen und
        Umsätze aus. Der genaue Leistungsumfang ergibt sich aus der Beschreibung auf der Website und
        dem individuellen Angebot an den Kunden.
      </p>

      <h2>§ 3 Vertragsschluss und Zugang</h2>
      <ol>
        <li>
          Der Anbieter unterbreitet dem Kunden ein Angebot per E-Mail. Der Vertrag kommt zustande,
          wenn der Kunde das Angebot in Textform annimmt. Danach richtet der Anbieter den Zugang
          ein. Eine kostenlose Testphase ist nicht vorgesehen, sofern das Angebot nichts anderes
          bestimmt.
        </li>
        <li>
          Der Kunde erhält einen Admin-Zugang und legt die Zugänge seiner Mitarbeitenden selbst an.
          Die Anmeldung erfolgt mit Google-Konten des Kunden. Zugangsdaten sind geheim zu halten.
        </li>
      </ol>

      <h2>§ 4 Verfügbarkeit und Änderungen</h2>
      <ol>
        <li>
          Der Anbieter strebt eine Verfügbarkeit des Dienstes von 99 % im Monatsmittel an.
          Ausgenommen sind angekündigte Wartungen, die nach Möglichkeit nachts stattfinden, sowie
          Störungen außerhalb des Einflussbereichs des Anbieters.
        </li>
        <li>
          Der Dienst hängt von Diensten Dritter ab (Meta, WhatsApp, Anthropic, Google, TeamUp). Für
          deren Ausfälle, Sperren oder Änderungen ihrer Schnittstellen und Richtlinien steht der
          Anbieter nicht ein, soweit er sie nicht zu vertreten hat.
        </li>
        <li>
          Der Anbieter darf den Dienst weiterentwickeln, sofern der vereinbarte Kern erhalten
          bleibt.
        </li>
      </ol>

      <h2>§ 5 Pflichten des Kunden</h2>
      <ol>
        <li>
          Der Kunde ist für die Rechtmäßigkeit der Werbung und der Datenerhebung verantwortlich,
          insbesondere für wirksame Einwilligungen zur Kontaktaufnahme per WhatsApp und für eigene
          Datenschutzhinweise gegenüber seinen Kundinnen und Kunden.
        </li>
        <li>
          Er hält die Nutzungsbedingungen und Richtlinien von Meta (einschließlich der WhatsApp
          Business-Richtlinien), Google und TeamUp ein und unterhält die dafür nötigen Konten.
        </li>
        <li>
          Er pflegt die Inhalte, auf die der Chatbot zugreift (z. B. Studio-Informationen), und
          prüft sie auf Richtigkeit.
        </li>
        <li>Er trägt Beratungsergebnisse, Termine und Umsätze vollständig und richtig ein.</li>
        <li>
          Er nutzt den Dienst nicht missbräuchlich, z. B. nicht für unerwünschte Massennachrichten.
        </li>
      </ol>

      <h2>§ 6 Chatbot mit künstlicher Intelligenz</h2>
      <p>
        Antworten des Chatbots werden automatisiert erzeugt und können fehlerhaft sein. Der Kunde
        kann den Bot jederzeit pausieren und Gespräche übernehmen. Der Chatbot nennt keine Preise
        und gibt sich nicht als Mensch aus; auf Nachfrage weist er auf die Automatisierung hin. Der
        Kunde prüft an ihn übergebene Gespräche zeitnah und bleibt für die Kommunikation mit seinen
        Kundinnen und Kunden verantwortlich.
      </p>

      <h2>§ 7 Vergütung</h2>
      <ol>
        <li>
          Der Kunde zahlt eine Provision auf den Tattoo-Umsatz, der aus Kontakten aus
          Meta-Lead-Formularen entsteht. Die Höhe ergibt sich aus dem individuellen Angebot.
          Beratungen sind kostenlos und nicht provisionspflichtig; Kontakte aus anderen Quellen (z.
          B. Laufkundschaft) ebenfalls nicht.
        </li>
        <li>
          Maßgeblich ist je Tattoo-Termin der im Dienst erfasste Endpreis. Erscheint die Kundin bzw.
          der Kunde nicht oder sagt ab und behält der Kunde eine Anzahlung ein, gilt die
          einbehaltene Anzahlung als Umsatz.
        </li>
        <li>
          Der Anbieter rechnet monatlich nach Ablauf des Kalendermonats ab, sobald für alle
          Tattoo-Termine des Monats Erscheinen und Endpreis erfasst sind. Rechnungen sind innerhalb
          von 14 Tagen ohne Abzug zahlbar.
        </li>
        <li>
          Die Beträge verstehen sich zuzüglich Umsatzsteuer, soweit diese anfällt. Derzeit wird als
          Kleinunternehmer nach § 19 UStG keine Umsatzsteuer berechnet.
        </li>
        <li>
          Kosten von Drittanbietern, insbesondere Werbekosten bei Meta und Gebühren der WhatsApp
          Business Platform, trägt der Kunde unmittelbar gegenüber dem jeweiligen Anbieter.
        </li>
      </ol>

      <h2>§ 8 Datenschutz und Auftragsverarbeitung</h2>
      <p>
        Soweit der Anbieter personenbezogene Daten im Auftrag des Kunden verarbeitet, schließen die
        Parteien einen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Einzelheiten stehen in der{" "}
        <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>

      <h2>§ 9 Rechte an Inhalten und Software</h2>
      <ol>
        <li>Die Daten des Kunden bleiben seine Daten.</li>
        <li>
          Der Kunde erhält für die Vertragsdauer ein einfaches, nicht übertragbares Recht, den
          Dienst für eigene geschäftliche Zwecke zu nutzen.
        </li>
      </ol>

      <h2>§ 10 Haftung</h2>
      <ol>
        <li>
          Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von
          Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.
        </li>
        <li>
          Bei einfacher Fahrlässigkeit haftet der Anbieter nur bei Verletzung wesentlicher
          Vertragspflichten (Pflichten, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags
          erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf). Die Haftung
          ist dann auf den vertragstypischen, vorhersehbaren Schaden begrenzt, höchstens auf die in
          den letzten zwölf Monaten vor dem Schadensereignis gezahlte Vergütung.
        </li>
        <li>
          Der Anbieter haftet nicht für entgangene Aufträge oder Umsätze infolge von Störungen bei
          Drittanbietern und nicht für Sperrungen oder Einschränkungen von Konten durch Meta oder
          WhatsApp, die auf Inhalten oder dem Verhalten des Kunden beruhen.
        </li>
        <li>
          Der Kunde stellt den Anbieter von Ansprüchen Dritter frei, die auf einer Verletzung seiner
          Pflichten nach § 5 beruhen, z. B. einer Kontaktaufnahme ohne wirksame Einwilligung.
        </li>
      </ol>

      <h2>§ 11 Laufzeit und Kündigung</h2>
      <ol>
        <li>
          Der Vertrag läuft auf unbestimmte Zeit und kann von beiden Seiten mit einer Frist von
          einem Monat zum Monatsende in Textform gekündigt werden.
        </li>
        <li>
          Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt,
          insbesondere bei Zahlungsverzug mit mehr als zwei Monatsrechnungen oder bei schweren
          Verstößen gegen diese Bedingungen.
        </li>
        <li>
          Für Tattoo-Termine aus Kontakten, die während der Vertragslaufzeit eingegangen sind, fällt
          die Provision auch dann an, wenn der Termin bis zu drei Monate nach Vertragsende
          stattfindet.
        </li>
      </ol>

      <h2>§ 12 Vertragsende und Daten</h2>
      <p>
        Nach Vertragsende kann der Kunde seine Daten innerhalb von 30 Tagen exportieren. Danach
        werden sie gelöscht, soweit keine Aufbewahrungspflichten bestehen.
      </p>

      <h2>§ 13 Änderungen dieser Bedingungen</h2>
      <p>
        Der Anbieter kann diese Bedingungen mit Wirkung für die Zukunft ändern. Er teilt Änderungen
        mindestens sechs Wochen vor ihrem Inkrafttreten in Textform mit. Widerspricht der Kunde
        nicht bis zum Inkrafttreten, gelten die Änderungen als angenommen; auf diese Folge weist der
        Anbieter in der Mitteilung hin. Widerspricht der Kunde, kann jede Seite den Vertrag zum
        Inkrafttreten der Änderung kündigen.
      </p>

      <h2>§ 14 Schlussbestimmungen</h2>
      <ol>
        <li>
          Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.
        </li>
        <li>
          Gerichtsstand ist Hamburg, soweit der Kunde Kaufmann, juristische Person des öffentlichen
          Rechts oder öffentlich-rechtliches Sondervermögen ist.
        </li>
        <li>Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.</li>
      </ol>
    </LegalPage>
  );
}
