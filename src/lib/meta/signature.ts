import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `X-Hub-Signature-256` header Meta sends with every webhook:
 * "sha256=" + hex(HMAC-SHA256(appSecret, rawBody)).
 * The raw, unparsed request body must be used.
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [algo, received] = signatureHeader.split("=", 2);
  if (algo !== "sha256" || !received || !/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const receivedBuf = Buffer.from(received, "hex");
  return receivedBuf.length === expected.length && timingSafeEqual(receivedBuf, expected);
}

export function signMetaPayload(rawBody: string | Buffer, appSecret: string): string {
  return "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
}
