import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/impressum" } };

export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum">
      <h2>Angaben gemäß § 5 DDG</h2>
      <address>
        {OPERATOR.name}
        <br />
        Inhaber: {OPERATOR.representative}
        <br />
        {OPERATOR.street}
        <br />
        {OPERATOR.city}
        <br />
        {OPERATOR.country}
      </address>

      <h2>Kontakt</h2>
      <p>
        E-Mail: <a href={`mailto:${OPERATOR.email}`}>{OPERATOR.email}</a>
        <br />
        Telefon: <a href={`tel:${OPERATOR.phoneE164}`}>{OPERATOR.phone}</a>
      </p>

      <h2>Umsatzsteuer</h2>
      <p>
        Kleinunternehmer im Sinne von § 19 UStG; es wird keine Umsatzsteuer berechnet und daher
        keine Umsatzsteuer-Identifikationsnummer angegeben.
      </p>

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <address>
        {OPERATOR.representative}
        <br />
        {OPERATOR.street}, {OPERATOR.city}
      </address>

      <h2>Verbraucherstreitbeilegung</h2>
      <p>
        Unser Angebot richtet sich ausschließlich an Unternehmer im Sinne von § 14 BGB. Wir sind
        nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer
        Verbraucherschlichtungsstelle teilzunehmen.
      </p>

      <h2>Haftung für Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir für eigene Inhalte auf diesen Seiten nach den allgemeinen
        Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir nicht verpflichtet, übermittelte oder
        gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf
        eine rechtswidrige Tätigkeit hinweisen. Sobald uns eine konkrete Rechtsverletzung bekannt
        wird, entfernen wir die betreffenden Inhalte umgehend.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Unsere Seiten enthalten Links zu Websites Dritter, auf deren Inhalte wir keinen Einfluss
        haben. Für diese Inhalte ist der jeweilige Anbieter oder Betreiber verantwortlich. Zum
        Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar. Werden uns Rechtsverletzungen
        bekannt, entfernen wir solche Links umgehend.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Texte, Logo und Gestaltung dieser Website sind urheberrechtlich geschützt. Eine Verwendung
        außerhalb der Grenzen des Urheberrechts bedarf unserer Zustimmung.
      </p>
    </LegalPage>
  );
}
