/**
 * Revenue of a tattoo session: before the session the planned price counts; once
 * the customer showed up, the final price; after a no-show or a cancellation with kept deposit,
 * the deposit. Prices are always per session, never for a whole tattoo.
 */
export interface RevenueSession {
  amountCents: number | null;
  depositCents?: number | null;
  finalAmountCents?: number | null;
  attendance?: "ATTENDED" | "NO_SHOW" | null;
  cancelled: boolean;
  depositKept?: boolean;
}

/** null = amount still unknown */
export function sessionRevenueCents(s: RevenueSession): number | null {
  if (s.cancelled) return s.depositKept ? (s.depositCents ?? 0) : 0;
  if (s.attendance === "NO_SHOW") return s.depositCents ?? 0;
  if (s.attendance === "ATTENDED") return s.finalAmountCents ?? s.amountCents;
  return s.amountCents;
}

/** Session is over but attendance was not recorded yet (without a time: from the next day). */
export function attendanceMissing(
  s: RevenueSession & { endsAt: Date | null; date: Date },
  now: Date,
) {
  if (s.cancelled || s.attendance) return false;
  return (s.endsAt ?? new Date(s.date.getTime() + 24 * 3600_000)) <= now;
}

/** Price of the session is final: attendance recorded (or cancelled). Needed for billing. */
export function priceFinal(s: RevenueSession) {
  return (
    s.cancelled ||
    s.attendance === "NO_SHOW" ||
    (s.attendance === "ATTENDED" && s.finalAmountCents != null)
  );
}
