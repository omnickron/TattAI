import type { Prisma } from "@/generated/prisma/client";

/**
 * Tattoo sessions that are over without "erschienen / nicht erschienen" (same rule as
 * `attendanceMissing`: end reached, without a time from the next day).
 */
export function missingAttendanceWhere(
  now: Date,
  tattooerId?: string | null,
): Prisma.TattooBookingWhereInput {
  return {
    cancelled: false,
    attendance: null,
    consultation: {
      status: "HELD",
      tattooBooked: true,
      lead: { isTest: false },
      ...(tattooerId ? { tattooerId } : {}),
    },
    OR: [
      { endsAt: { lte: now } },
      { endsAt: null, date: { lte: new Date(now.getTime() - 24 * 3600_000) } },
    ],
  };
}
