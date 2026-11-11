/**
 * Operator details for the public website and legal pages.
 * The legal texts are best-effort drafts; a legal review is still recommended.
 */
export const OPERATOR = {
  name: "Nick Schestag Webdevelopment",
  legalForm: "Einzelunternehmen",
  representative: "Nick Schestag",
  street: "Feldbrunnenstraße 31",
  city: "20148 Hamburg",
  country: "Deutschland",
  email: "info@needl-booker.de",
  privacyEmail: "datenschutz@needl-booker.de",
  phone: "+49 176 34614265",
  phoneE164: "+4917634614265",
  /** Small business (§ 19 UStG): no VAT, no VAT ID */
  smallBusiness: true,
} as const;

/** Date shown as "Stand" on the legal pages. */
export const LEGAL_LAST_UPDATED = "11. November 2026";

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
