import { describe, expect, it } from "vitest";
import { signMetaPayload, verifyMetaSignature } from "./signature";

const secret = "test-secret";
const body = JSON.stringify({ object: "page", entry: [] });

describe("verifyMetaSignature", () => {
  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, secret), secret)).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, "other"), secret)).toBe(false);
  });

  it("rejects a modified body", () => {
    expect(verifyMetaSignature(body + " ", signMetaPayload(body, secret), secret)).toBe(false);
  });

  it.each([null, undefined, "", "sha256=", "sha1=abc", "sha256=zz", "sha256=" + "a".repeat(63)])(
    "rejects malformed header %j",
    (header) => {
      expect(verifyMetaSignature(body, header, secret)).toBe(false);
    },
  );

  it("rejects everything when no secret is configured", () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, ""), "")).toBe(false);
  });
});
