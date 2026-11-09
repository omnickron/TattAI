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

/** "Termine anfragen" opens a prepared e-mail (no form, no tracking). */
export const contactMailto = `mailto:${OPERATOR.email}?subject=${encodeURIComponent(
  "Anfrage NEEDL",
)}&body=${encodeURIComponent(
  "Hallo NEEDL-Team,\n\nwir möchten mehr Beratungstermine für unser Studio.\n\nStudio:\nOrt:\nAnzahl Tätowierer:\nTelefon (optional):\n\nViele Grüße",
)}`;

/**
 * Commercial terms shown on the start page (section "Provision").
 * `rate` is shown only when set, e.g. "15 %". TODO: confirm wording before going live.
 */
export const PRICING: { rate: string | null } = { rate: null };
