import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bot API authentication: "Authorization: Bearer <BOT_API_KEY>".
 * Returns null if valid, otherwise the HTTP status to answer with.
 */
export function checkBotAuth(
  authorization: string | null,
  apiKey = process.env.BOT_API_KEY,
): 401 | 503 | null {
  if (!apiKey || apiKey.length < 32) return 503; // not configured (or too weak)
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!match) return 401;
  // Compare hashes so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(match[1].trim()).digest();
  const b = createHash("sha256").update(apiKey).digest();
  return timingSafeEqual(a, b) ? null : 401;
}

/** Signature of outgoing bot events: hex HMAC-SHA256 over "<timestamp>.<body>". */
export function signBotEvent(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
