import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Ph } from "@/components/legal-page";
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
        Umsätze aus. Der genaue Leistungsumfang ergibt sich aus{" "}
        <Ph>Angebot bzw. Leistungsbeschreibung</Ph>.
      </p>

      <h2>§ 3 Vertragsschluss und Zugang</h2>
      <ol>
        <li>
          <Ph>Wie der Vertrag zustande kommt (Angebot, Bestätigung, Testphase)</Ph>
        </li>
        <li>
          Der Kunde erhält einen Admin-Zugang und legt die Zugänge seiner Mitarbeitenden selbst an.
          Die Anmeldung erfolgt mit Google-Konten des Kunden. Zugangsdaten sind geheim zu halten.
        </li>
      </ol>

      <h2>§ 4 Verfügbarkeit und Änderungen</h2>
      <ol>
        <li>
          <Ph>angestrebte Verfügbarkeit, Wartungsfenster</Ph>
        </li>
        <li>
          Der Dienst hängt von Diensten Dritter ab (Meta, WhatsApp, Anthropic, Google, TeamUp). Für
          deren Ausfälle, Sperren oder Änderungen ihrer Schnittstellen und Richtlinien steht der
          Anbieter nicht ein. <Ph>prüfen</Ph>
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
        kann den Bot jederzeit pausieren und Gespräche übernehmen. Der Chatbot nennt keine Preise.{" "}
        <Ph>Haftung und Kontrollpflichten prüfen; Art. 50 KI-Verordnung</Ph>
      </p>

      <h2>§ 7 Vergütung</h2>
      <p>
        <Ph>
          Vergütungsmodell (z. B. Provision auf Umsatz aus vermittelten Terminen), Abrechnung
          monatlich, Zahlungsziel, Umsatzsteuer
        </Ph>
      </p>

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
          Dienst zu nutzen. <Ph>prüfen</Ph>
        </li>
      </ol>

      <h2>§ 10 Haftung</h2>
      <p>
        <Ph>
          Haftungsregelung: unbeschränkt bei Vorsatz, grober Fahrlässigkeit und Verletzung von
          Leben, Körper, Gesundheit; bei einfacher Fahrlässigkeit nur bei wesentlichen
          Vertragspflichten und begrenzt auf den vorhersehbaren Schaden
        </Ph>
      </p>

      <h2>§ 11 Laufzeit und Kündigung</h2>
      <p>
        <Ph>Laufzeit, Kündigungsfristen, außerordentliche Kündigung</Ph>
      </p>

      <h2>§ 12 Vertragsende und Daten</h2>
      <p>
        Nach Vertragsende kann der Kunde seine Daten innerhalb von <Ph>Frist</Ph> exportieren.
        Danach werden sie gelöscht, soweit keine Aufbewahrungspflichten bestehen.
      </p>

      <h2>§ 13 Änderungen dieser Bedingungen</h2>
      <p>
        <Ph>Verfahren für Änderungen (Ankündigung, Widerspruchsfrist)</Ph>
      </p>

      <h2>§ 14 Schlussbestimmungen</h2>
      <ol>
        <li>
          Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.
        </li>
        <li>
          Gerichtsstand ist <Ph>Ort</Ph>, soweit der Kunde Kaufmann, juristische Person des
          öffentlichen Rechts oder öffentlich-rechtliches Sondervermögen ist.
        </li>
        <li>Sollte eine Bestimmung unwirksam sein, bleiben die übrigen wirksam.</li>
      </ol>
    </LegalPage>
  );
}
