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
