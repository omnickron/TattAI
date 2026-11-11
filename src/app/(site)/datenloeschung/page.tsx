import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { OPERATOR } from "@/lib/site/content";

export const metadata: Metadata = {
  title: "Anleitung zur Datenlöschung",
  description: "So lässt du deine Daten bei NEEDL löschen.",
  alternates: { canonical: "/datenloeschung" },
};

export default function DatenloeschungPage() {
  const mail = `mailto:${OPERATOR.privacyEmail}?subject=${encodeURIComponent("Löschanfrage")}`;
  return (
    <LegalPage title="Anleitung zur Datenlöschung">
      <p>
        Hier erfährst du, wie du die Daten löschen lassen kannst, die NEEDL über dich verarbeitet –
        zum Beispiel, nachdem du dich über ein Formular in einer Facebook- oder Instagram-Anzeige
        bei einem Tattoo-Studio gemeldet oder mit ihm über WhatsApp geschrieben hast.
      </p>

      <h2>1. Welche Daten betroffen sind</h2>
      <ul>
        <li>Angaben aus dem Lead-Formular: Name, Telefonnummer, ggf. E-Mail-Adresse</li>
        <li>deine Einwilligung (Zeitpunkt und Wortlaut)</li>
        <li>der WhatsApp-Chatverlauf mit dem Studio, einschließlich gesendeter Bilder</li>
        <li>die Zusammenfassung deiner Tattoo-Idee</li>
        <li>gebuchte Beratungs- und Tattoo-Termine, auch die Einträge im Kalender des Studios</li>
        <li>Notizen und Ergebnisse der Beratung</li>
      </ul>

      <h2>2. So beantragst du die Löschung</h2>
      <ol>
        <li>
          Schreib eine E-Mail an <a href={mail}>{OPERATOR.privacyEmail}</a> mit dem Betreff
          „Löschanfrage“.
        </li>
        <li>
          Gib die Telefonnummer an, mit der du das Formular ausgefüllt oder per WhatsApp geschrieben
          hast, und – wenn bekannt – den Namen des Tattoo-Studios.
        </li>
        <li>
          Wir prüfen, ob die Anfrage von dir kommt. Dafür können wir dich z. B. bitten, uns von
          dieser Nummer per WhatsApp zu bestätigen.
        </li>
        <li>
          Wir löschen deine Daten gemeinsam mit dem Studio und bestätigen dir die Löschung per
          E-Mail – unverzüglich, spätestens innerhalb eines Monats.
        </li>
      </ol>
      <p>
        Du kannst dich mit deiner Anfrage auch direkt an das Tattoo-Studio wenden. Das Studio löscht
        deine Daten dann in NEEDL.
      </p>

      <h2>3. Was danach noch gespeichert bleibt</h2>
      <p>
        Daten, die wir oder das Studio aus gesetzlichen Gründen aufbewahren müssen (z. B.
        steuerrelevante Angaben zu einem bezahlten Tattoo-Termin), werden gesperrt und erst nach
        Ablauf der Frist gelöscht. Das betrifft vor allem Angaben, die in Rechnungen und Buchhaltung
        eingehen; sie werden bis zu zehn Jahre aufbewahrt (§ 147 AO, § 257 HGB). Sicherungskopien
        werden nach 14 Tagen überschrieben.
      </p>

      <h2>4. Automatische Löschung</h2>
      <p>
        Auch ohne Antrag löscht NEEDL Leads ohne Beratung oder Termin automatisch zehn Monate nach
        der letzten Aktivität.
      </p>

      <h2>5. WhatsApp-Nachrichten abbestellen</h2>
      <p>
        Wenn du keine Nachrichten mehr bekommen möchtest, kannst du deine Einwilligung jederzeit
        widerrufen – per E-Mail an die oben genannte Adresse oder mit einer Nachricht an das Studio
        im WhatsApp-Chat. Schreibst du dort „STOP“, „Stopp“ oder „Abmelden“, bekommst du ab sofort
        keine automatischen Nachrichten mehr. Bittest du im Chat um Löschung deiner Daten, wird das
        Gespräch an einen Menschen aus dem Studio übergeben, der die Löschung veranlasst.
      </p>

      <h2>6. Daten bei Meta</h2>
      <p>
        Diese Anleitung betrifft die Daten bei NEEDL. Daten, die Meta selbst über dich speichert (z.
        B. in deinem Facebook- oder Instagram-Konto), verwaltest du in den Einstellungen deines
        Kontos bei Meta.
      </p>

      <p>
        Mehr dazu, wie wir Daten verarbeiten, steht in der{" "}
        <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>
    </LegalPage>
  );
}
