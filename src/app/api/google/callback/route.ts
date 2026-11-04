import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { appUrl } from "@/lib/app-url";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { APP_CALENDAR_NAME, isTeamupCalendarId } from "@/lib/google/calendar";
import { moveUpcomingEntries } from "@/lib/scheduling/calendar-switch";
import { createCalendarClient } from "@/lib/google/client";
import { resyncTattooerSessions } from "@/lib/scheduling/session-calendar";
import { CALENDAR_SCOPES, exchangeCalendarCode, STATE_COOKIE } from "@/lib/google/oauth";

function back(request: NextRequest, result: string) {
  return NextResponse.redirect(appUrl(`/availability?google=${result}`, request));
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** OAuth callback: stores the encrypted refresh token and creates the "Beratungen" calendar. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.tattooerProfile) return NextResponse.redirect(appUrl("/login", request));

  const jar = await cookies();
  const stored = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/google" });
  const params = request.nextUrl.searchParams;
  const [state, userId] = stored.split(".");
  if (!state || userId !== user.id || !safeEqual(state, params.get("state") ?? ""))
    return back(request, "error");
  if (params.get("error")) return back(request, "denied");
  const code = params.get("code");
  if (!code) return back(request, "error");

  try {
    const { refreshToken, scopes, email } = await exchangeCalendarCode(code);
    const missing = CALENDAR_SCOPES.filter((s) => s.startsWith("https://") && !scopes.includes(s));
    if (!refreshToken || missing.length) return back(request, "scopes");
    if (email && email !== user.email.toLowerCase()) return back(request, "account");

    const refreshTokenEnc = encryptSecret(refreshToken);
    const profile = await prisma.tattooerProfile.findUniqueOrThrow({
      where: { id: user.tattooerProfile.id },
    });
    // While TeamUp was used, the Google app calendar is remembered separately
    const previousGoogleCalendar =
      profile.calendarProvider === "TEAMUP" || isTeamupCalendarId(profile.consultationCalendarId)
        ? profile.googleCalendarId
        : profile.consultationCalendarId;
    const calendarId = await createCalendarClient().ensureConsultationCalendar({
      tattooerId: profile.id,
      provider: "GOOGLE",
      refreshTokenEnc,
      calendarId: previousGoogleCalendar,
    });
    const switched = profile.calendarProvider === "TEAMUP";
    await prisma.tattooerProfile.update({
      where: { id: profile.id },
      data: {
        googleRefreshTokenEnc: refreshTokenEnc,
        googleAccountEmail: email ?? user.email,
        googleConnectedAt: new Date(),
        // Connecting Google means using Google
        calendarProvider: "GOOGLE",
        consultationCalendarId: calendarId,
        googleCalendarId: calendarId,
        consultationCalendarName:
          previousGoogleCalendar === calendarId
            ? profile.consultationCalendarName
            : APP_CALENDAR_NAME,
      },
    });
    const deps = { prisma, calendar: createCalendarClient(), appUrl: process.env.APP_URL };
    if (switched) {
      // Coming from TeamUp: move upcoming appointments over to Google
      await moveUpcomingEntries(deps, profile.id).catch((err) =>
        console.error("[google] moving entries after switch failed:", err),
      );
    } else {
      // Catch up on tattoo sessions that could not be written before (best effort).
      await resyncTattooerSessions(deps, profile.id).catch((err) =>
        console.error("[google] resync after connect failed:", err),
      );
    }
    return back(request, "connected");
  } catch (err) {
    console.error("[google] calendar connection failed:", err instanceof Error ? err.message : err);
    return back(request, "error");
  }
}
