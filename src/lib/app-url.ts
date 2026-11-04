/**
 * Absolute URL inside the app. Uses APP_URL (the public address behind the reverse proxy),
 * because request.url inside the container may carry the internal host (e.g. 0.0.0.0:3000).
 */
export function appUrl(path: string, request?: { url: string }): URL {
  const base = process.env.APP_URL?.trim() || request?.url || "http://localhost:3000";
  return new URL(path, base);
}
