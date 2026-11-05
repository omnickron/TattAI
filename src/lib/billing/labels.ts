export const INVOICE_STATUS: Record<string, { label: string; tone: "amber" | "green" | "gray" }> = {
  OPEN: { label: "offen", tone: "amber" },
  PAID: { label: "bezahlt", tone: "green" },
  CANCELLED: { label: "storniert", tone: "gray" },
};
