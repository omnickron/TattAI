/** Parses a euro amount as typed in German forms ("1.250,50", "1250", "1250.5 €") into cents. */
export function parseEuroToCents(input: string | null | undefined): number | null | "invalid" {
  const raw = (input ?? "").replace(/€|\s/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(",")) normalized = raw.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) normalized = raw.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "invalid";
  const cents = Math.round(Number(normalized) * 100);
  return cents > 100_000_000 ? "invalid" : cents;
}

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const euroRound = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

export function formatEuro(cents: number | null | undefined, round = false): string {
  if (cents === null || cents === undefined) return "–";
  return (round ? euroRound : euro).format(cents / 100);
}

/** Value for an input field: 125000 → "1250,00". */
export function centsToInput(cents: number | null | undefined): string {
  return cents === null || cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ",");
}
