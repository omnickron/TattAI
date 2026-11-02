import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { createCalendarClient } from "@/lib/google/client";
import { CALENDAR_SCOPES, exchangeCalendarCode, STATE_COOKIE } from "@/lib/google/oauth";

function back(request: NextRequest, result: string) {
  return NextResponse.redirect(new URL(`/availability?google=${result}`, request.url));
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** OAuth callback: stores the encrypted refresh token and creates the "Beratungen" calendar. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.tattooerProfile) return NextResponse.redirect(new URL("/login", request.url));

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
    const calendarId = await createCalendarClient().ensureConsultationCalendar({
      tattooerId: profile.id,
      refreshTokenEnc,
      calendarId: profile.consultationCalendarId,
    });
    await prisma.tattooerProfile.update({
      where: { id: profile.id },
      data: {
        googleRefreshTokenEnc: refreshTokenEnc,
        googleAccountEmail: email ?? user.email,
        googleConnectedAt: new Date(),
        consultationCalendarId: calendarId,
      },
    });
    return back(request, "connected");
  } catch (err) {
    console.error("[google] calendar connection failed:", err instanceof Error ? err.message : err);
    return back(request, "error");
  }
}
