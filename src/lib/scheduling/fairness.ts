/**
 * Fair distribution of consultations across tattooers (pure, no I/O).
 *
 * Each active tattooer has a target share (weight, normalised to 100 %).
 * For a new consultation, among the tattooers who are free at the requested
 * time, the one with the largest deficit wins:
 *
 *   deficit = share × (total consultations in window + 1) − own consultations in window
 *
 * "+ 1" counts the consultation being assigned, so the result answers
 * "who should have this one?" (with an empty history, the largest share wins).
 * Ties: oldest last consultation (never = oldest), then random.
 */

export interface FairnessMember {
  tattooerId: string;
  /** Raw weight ≥ 0; normalised across all members. */
  weight: number;
  /** Non-cancelled consultations in the evaluation window. */
  count: number;
  lastConsultationAt: Date | null;
}

export interface FairnessScore extends FairnessMember {
  share: number;
  target: number;
  deficit: number;
}

const EPSILON = 1e-9;

/** Normalises weights to shares that sum to 1 (equal shares if all are 0). */
export function normalizeShares(weights: number[]): number[] {
  const clean = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = clean.reduce((a, b) => a + b, 0);
  if (sum <= 0) return clean.map(() => (clean.length ? 1 / clean.length : 0));
  return clean.map((w) => w / sum);
}

/** Shares, targets and deficits for all active members. */
export function scoreMembers(members: FairnessMember[]): FairnessScore[] {
  const shares = normalizeShares(members.map((m) => m.weight));
  const total = members.reduce((sum, m) => sum + m.count, 0) + 1;
  return members.map((m, i) => {
    const target = shares[i] * total;
    return { ...m, share: shares[i], target, deficit: target - m.count };
  });
}

/**
 * Picks the tattooer for a new consultation.
 * @param members all active tattooers (defines shares and the total)
 * @param freeIds tattooers available at the requested time
 * @param random injectable for tests, returns [0, 1)
 */
export function chooseTattooer(
  members: FairnessMember[],
  freeIds: Iterable<string>,
  random: () => number = Math.random,
): FairnessScore | null {
  const free = new Set(freeIds);
  const candidates = scoreMembers(members).filter((s) => free.has(s.tattooerId));
  if (!candidates.length) return null;

  const maxDeficit = Math.max(...candidates.map((c) => c.deficit));
  let best = candidates.filter((c) => c.deficit >= maxDeficit - EPSILON);
  if (best.length > 1) {
    const age = (c: FairnessScore) => c.lastConsultationAt?.getTime() ?? Number.NEGATIVE_INFINITY;
    const oldest = Math.min(...best.map(age));
    best = best.filter((c) => age(c) === oldest);
  }
  return best[Math.min(best.length - 1, Math.floor(random() * best.length))];
}
