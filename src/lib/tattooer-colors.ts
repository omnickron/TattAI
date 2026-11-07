/**
 * Calendar colors of the tattooers. The admin picks one per tattooer (stored as hex on the
 * TattooerProfile); without a choice the color follows the order of creation.
 */
export const TATTOOER_COLORS = [
  { value: "#2563eb", label: "Blau" },
  { value: "#8b5cf6", label: "Violett" },
  { value: "#fbbf24", label: "Gelb" },
  { value: "#059669", label: "Grün" },
  { value: "#f43f5e", label: "Rot" },
  { value: "#22d3ee", label: "Türkis" },
  { value: "#18181b", label: "Schwarz" },
  { value: "#f97316", label: "Orange" },
  { value: "#ec4899", label: "Pink" },
  { value: "#84cc16", label: "Hellgrün" },
  { value: "#4f46e5", label: "Indigo" },
  { value: "#92400e", label: "Braun" },
  { value: "#64748b", label: "Grau" },
] as const;

const HEX = /^#[0-9a-f]{6}$/;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

/** Stored color, or the default for the tattooer's position (order of creation). */
export function tattooerColor(stored: string | null | undefined, index: number): string {
  if (isColor(stored)) return stored;
  return TATTOOER_COLORS[Math.max(0, index) % TATTOOER_COLORS.length].value;
}

/** Readable text color (white or near-black) on the given background. */
export function textColorOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast against white vs. against #18181b (luminance ≈ 0.009)
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.059 ? "#ffffff" : "#18181b";
}
