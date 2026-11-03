import { describe, expect, it } from "vitest";
import { formatRelative } from "./format";

describe("formatRelative (Europe/Berlin)", () => {
  const now = new Date("2026-11-04T10:00:00Z"); // 11:00 in Berlin
  it.each([
    ["2026-11-04T09:59:40Z", "gerade eben"],
    ["2026-11-04T09:55:00Z", "vor 5 Min."],
    ["2026-11-04T07:00:00Z", "vor 3 Std."],
    ["2026-11-03T13:20:00Z", "gestern, 14:20"],
    ["2026-11-01T10:00:00Z", "01.11."],
  ])("%s → %s", (date, expected) => {
    expect(formatRelative(new Date(date), now)).toBe(expected);
  });
});
