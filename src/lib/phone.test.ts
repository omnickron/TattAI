import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["0151 23456789", "+4915123456789"],
    ["+49 151 23456789", "+4915123456789"],
    ["0049 (0)151-234 567 89", "+4915123456789"],
    ["030 12345678", "+493012345678"],
    ["+43 664 1234567", "+436641234567"],
    ["  01512 3456789 ", "+4915123456789"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toEqual({ valid: true, e164: expected, raw: input.trim() });
  });

  it.each(["", "   ", "12345", "abc", "+49 1"])("marks %j as invalid", (input) => {
    const result = normalizePhone(input);
    expect(result.valid).toBe(false);
    expect(result.e164).toBeNull();
  });

  it("handles null and undefined", () => {
    expect(normalizePhone(null).valid).toBe(false);
    expect(normalizePhone(undefined).valid).toBe(false);
  });

  it("uses the given default country for national numbers", () => {
    expect(normalizePhone("0664 1234567", "AT").e164).toBe("+436641234567");
  });
});
