export const PURPOSE_LABELS = {
  FIRST_CONTACT: "Erstkontakt",
  FOLLOW_UP: "Nachfassen",
  REMINDER: "Erinnerung",
} as const;

export const TEMPLATE_STATUS_LABELS = {
  DRAFT: { label: "Entwurf", tone: "gray" },
  PENDING: { label: "in Prüfung bei Meta", tone: "amber" },
  APPROVED: { label: "genehmigt", tone: "green" },
  REJECTED: { label: "abgelehnt", tone: "red" },
  PAUSED: { label: "von Meta pausiert", tone: "red" },
} as const;

export const OUTBOUND_KIND_LABELS = {
  FIRST_CONTACT: "Erstkontakt",
  FOLLOW_UP: "Nachfassen",
  REMINDER: "Erinnerung",
} as const;

export const OUTBOUND_STATUS_LABELS = {
  QUEUED: { label: "geplant", tone: "blue" },
  SENT: { label: "gesendet", tone: "green" },
  FAILED: { label: "fehlgeschlagen", tone: "red" },
  CANCELLED: { label: "entfallen", tone: "gray" },
} as const;

export const MESSAGE_STATUS_LABELS: Record<string, string> = {
  sent: "gesendet",
  delivered: "zugestellt",
  read: "gelesen",
  failed: "fehlgeschlagen",
  received: "empfangen",
};
