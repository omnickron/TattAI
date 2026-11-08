import type { Metadata } from "next";
import { LegalPage, Ph } from "@/components/legal-page";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/impressum" } };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <address>
        {OPERATOR.name}
        <br />
        {OPERATOR.legalForm}
        <br />
        {OPERATOR.street}
        <br />
        {OPERATOR.city}
        <br />
        {OPERATOR.country}
      </address>
      <p>
        Vertreten durch: {OPERATOR.representative}
        <br />
        <Ph>nur bei Gesellschaften, sonst Zeile entfernen</Ph>
      </p>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        <br />
        Telefon: {OPERATOR.phone}
      </p>

      <h2>Registereintrag</h2>
      <p>{OPERATOR.register}</p>

      <h2>Umsatzsteuer</h2>
      <p>
        Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: {OPERATOR.vatId}
        <br />
        <Ph>bei Kleinunternehmerregelung nach § 19 UStG ggf. Hinweis statt USt-IdNr.</Ph>
      </p>

      <h2>Berufsrechtliche Angaben</h2>
      <p>
        <Ph>Aufsichtsbehörde bzw. Kammer, falls erforderlich – sonst Abschnitt entfernen</Ph>
      </p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <address>
        {OPERATOR.representative}
        <br />
        {OPERATOR.street}, {OPERATOR.city}
      </address>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Unser Angebot richtet sich ausschließlich an Unternehmer. Wir sind nicht bereit und nicht
        verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen. <Ph>Formulierung prüfen</Ph>
      </p>

      <h2>Haftung für Inhalte und Links</h2>
      <p>
        <Ph>optionaler Hinweis zur Haftung für eigene Inhalte (§ 7 DDG) und für externe Links</Ph>
      </p>
    </LegalPage>
  );
}
