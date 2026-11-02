import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { isCalendarMock } from "@/lib/google/mock-calendar";
import { buildCalendarAuthUrl } from "@/lib/google/oauth";

import { STATE_COOKIE } from "@/lib/google/oauth";

/** Starts the Google Calendar connection for the signed-in tattooer. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!user.tattooerProfile) return NextResponse.redirect(new URL("/leads", request.url));

  if (isCalendarMock()) {
    await prisma.tattooerProfile.update({
      where: { id: user.tattooerProfile.id },
      data: {
        googleConnectedAt: new Date(),
        googleAccountEmail: user.email,
        consultationCalendarId: `mock-beratungen-${user.tattooerProfile.id}`,
      },
    });
    return NextResponse.redirect(new URL("/availability?google=connected", request.url));
  }

  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${state}.${user.id}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: 600,
  });
  return NextResponse.redirect(buildCalendarAuthUrl(state, user.email));
}
