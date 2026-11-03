/** Google OAuth for the calendar connection (separate from the login). */

export const STATE_COOKIE = "gcal_oauth_state";

export const CALENDAR_SCOPES = [
  "openid",
  "email",
  // Create and manage only calendars created by this app ("Studio-Termine")
  "https://www.googleapis.com/auth/calendar.app.created",
  // Free/busy of all calendars, without access to event details
  "https://www.googleapis.com/auth/calendar.freebusy",
  // List the person's calendars (needed to query free/busy over all of them)
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

function credentials() {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET are not set");
  return { clientId, clientSecret };
}

export function calendarRedirectUri(): string {
  return `${process.env.APP_URL ?? "http://localhost:3000"}/api/google/callback`;
}

export function buildCalendarAuthUrl(state: string, loginHint?: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", credentials().clientId);
  url.searchParams.set("redirect_uri", calendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  const domain = process.env.GOOGLE_WORKSPACE_DOMAIN?.trim();
  if (domain) url.searchParams.set("hd", domain);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok)
    throw new Error(`Google token endpoint ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as TokenResponse;
}

/** Exchanges the authorization code; returns refresh token, granted scopes and account e-mail. */
export async function exchangeCalendarCode(code: string) {
  const token = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: calendarRedirectUri(),
  });
  let email: string | null = null;
  if (token.id_token) {
    // The id_token comes directly from Google's token endpoint over TLS, so decoding suffices.
    const payload = JSON.parse(Buffer.from(token.id_token.split(".")[1], "base64url").toString());
    email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  }
  return {
    refreshToken: token.refresh_token ?? null,
    scopes: (token.scope ?? "").split(" "),
    email,
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const token = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return {
    accessToken: token.access_token,
    expiresAt: Date.now() + (token.expires_in - 60) * 1000,
  };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}
