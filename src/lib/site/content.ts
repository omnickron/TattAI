/**
 * Operator details for the public website and legal pages.
 * TODO before going live: replace every [PLATZHALTER …] and have the legal texts reviewed.
 */
export const OPERATOR = {
  name: "[PLATZHALTER: Name bzw. Firma des Betreibers]",
  legalForm: "[PLATZHALTER: Rechtsform, z. B. Einzelunternehmen]",
  representative: "[PLATZHALTER: Vertretungsberechtigte Person]",
  street: "[PLATZHALTER: Straße und Hausnummer]",
  city: "[PLATZHALTER: PLZ Ort]",
  country: "Deutschland",
  email: "kontakt@needl-booker.de",
  privacyEmail: "datenschutz@needl-booker.de",
  phone: "[PLATZHALTER: Telefonnummer]",
  vatId: "[PLATZHALTER: USt-IdNr. nach § 27a UStG – oder Zeile entfernen]",
  register: "[PLATZHALTER: Registergericht und Registernummer – oder Zeile entfernen]",
} as const;

/** Date shown as "Stand" on the legal pages. */
export const LEGAL_LAST_UPDATED = "[PLATZHALTER: Datum]";

export const LEGAL_NAV = [
  { href: "/impressum", label: "Impressum" },
  { href: "/datenschutz", label: "Datenschutz" },
  { href: "/nutzungsbedingungen", label: "Nutzungsbedingungen" },
  { href: "/datenloeschung", label: "Datenlöschung" },
] as const;

/** "Demo anfragen" opens a prepared e-mail (no form, no tracking). */
export const demoMailto = `mailto:${OPERATOR.email}?subject=${encodeURIComponent(
  "Demo-Anfrage NEEDL",
)}&body=${encodeURIComponent(
  "Hallo NEEDL-Team,\n\nich interessiere mich für NEEDL.\n\nStudio:\nOrt:\nAnzahl Tätowierer:\nTelefon (optional):\n\nViele Grüße",
)}`;

/**
 * Commercial terms shown on the start page (section "Konditionen").
 * TODO: confirm wording and numbers before going live.
 */
export const PRICING = {
  model: "Provision auf den Tattoo-Umsatz aus NEEDL-Leads",
  rate: "[PLATZHALTER: Provision in %]",
  details: [
    "Abrechnung monatlich, nachvollziehbar pro Tattoo-Termin",
    "Werbebudget zahlst du direkt an Meta – volle Kontrolle über deine Kampagnen",
    "[PLATZHALTER: Einrichtung, Grundgebühr, Laufzeit/Kündigung]",
  ],
} as const;
