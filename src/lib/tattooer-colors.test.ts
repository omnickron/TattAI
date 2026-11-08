import { describe, expect, it } from "vitest";
import { isColor, tattooerColor, textColorOn, TATTOOER_COLORS } from "./tattooer-colors";

describe("tattooer colors", () => {
  it("uses the stored color when valid", () => {
    expect(tattooerColor("#123abc", 3)).toBe("#123abc");
  });

  it("falls back to the palette by position", () => {
    expect(tattooerColor(null, 0)).toBe(TATTOOER_COLORS[0].value);
    expect(tattooerColor("rot", 1)).toBe(TATTOOER_COLORS[1].value);
    expect(tattooerColor(undefined, TATTOOER_COLORS.length)).toBe(TATTOOER_COLORS[0].value);
  });

  it("validates hex colors", () => {
    expect(isColor("#aabbcc")).toBe(true);
    expect(isColor("#ABC")).toBe(false);
    expect(isColor("blue")).toBe(false);
  });

  it("picks readable text colors", () => {
    expect(textColorOn("#18181b")).toBe("#ffffff");
    expect(textColorOn("#2563eb")).toBe("#ffffff");
    expect(textColorOn("#fbbf24")).toBe("#18181b");
    expect(textColorOn("#ffffff")).toBe("#18181b");
  });
});
