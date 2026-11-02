import { describe, expect, it } from "vitest";
import { chooseTattooer, normalizeShares, scoreMembers, type FairnessMember } from "./fairness";

const m = (
  tattooerId: string,
  weight: number,
  count: number,
  last: string | null = null,
): FairnessMember => ({
  tattooerId,
  weight,
  count,
  lastConsultationAt: last ? new Date(last) : null,
});

describe("normalizeShares", () => {
  it("normalises to a sum of 1", () => {
    expect(normalizeShares([50, 30, 20])).toEqual([0.5, 0.3, 0.2]);
    expect(normalizeShares([2, 1, 1])).toEqual([0.5, 0.25, 0.25]);
  });

  it("treats invalid/negative weights as 0 and falls back to equal shares", () => {
    expect(normalizeShares([1, -1, Number.NaN])).toEqual([1, 0, 0]);
    expect(normalizeShares([0, 0])).toEqual([0.5, 0.5]);
    expect(normalizeShares([])).toEqual([]);
  });
});

describe("chooseTattooer", () => {
  it("returns null when nobody is free", () => {
    expect(chooseTattooer([m("a", 1, 0)], [])).toBeNull();
  });

  it("picks the largest deficit", () => {
    // total = 10 + 1; a: 0.5*11-6 = -0.5, b: 0.25*11-2 = 0.75, c: 0.25*11-2 = 0.75 → tie b/c
    const members = [m("a", 2, 6), m("b", 1, 2, "2026-01-10"), m("c", 1, 2, "2026-01-05")];
    expect(chooseTattooer(members, ["a", "b", "c"])?.tattooerId).toBe("c");
  });

  it("only considers free tattooers, even if others are further behind", () => {
    const members = [m("a", 1, 0), m("b", 1, 5)];
    expect(chooseTattooer(members, ["b"])?.tattooerId).toBe("b");
  });

  it("gives the first consultation to the largest share", () => {
    const members = [m("a", 1, 0), m("b", 3, 0)];
    expect(chooseTattooer(members, ["a", "b"])?.tattooerId).toBe("b");
  });

  it("breaks ties by oldest last consultation (never booked first)", () => {
    const members = [m("a", 1, 1, "2026-01-01"), m("b", 1, 1, null)];
    expect(chooseTattooer(members, ["a", "b"])?.tattooerId).toBe("b");
  });

  it("falls back to random among complete ties", () => {
    const members = [m("a", 1, 0), m("b", 1, 0), m("c", 1, 0)];
    expect(chooseTattooer(members, ["a", "b", "c"], () => 0)?.tattooerId).toBe("a");
    expect(chooseTattooer(members, ["a", "b", "c"], () => 0.5)?.tattooerId).toBe("b");
    expect(chooseTattooer(members, ["a", "b", "c"], () => 0.999)?.tattooerId).toBe("c");
  });

  it("converges to the target shares over many bookings", () => {
    const members = [m("a", 50, 0), m("b", 30, 0), m("c", 20, 0)];
    for (let i = 0; i < 100; i++) {
      const winner = chooseTattooer(members, ["a", "b", "c"], () => 0)!;
      const member = members.find((x) => x.tattooerId === winner.tattooerId)!;
      member.count++;
      member.lastConsultationAt = new Date(2026, 0, 1, 0, i);
    }
    expect(members.map((x) => x.count)).toEqual([50, 30, 20]);
  });

  it("catches up a tattooer who was unavailable for a while", () => {
    const members = [m("a", 1, 0), m("b", 1, 0)];
    // b is on vacation for 10 bookings
    for (let i = 0; i < 10; i++) members[0].count += chooseTattooer(members, ["a"]) ? 1 : 0;
    const next = Array.from({ length: 4 }, () => {
      const w = chooseTattooer(members, ["a", "b"], () => 0)!;
      members.find((x) => x.tattooerId === w.tattooerId)!.count++;
      return w.tattooerId;
    });
    expect(next).toEqual(["b", "b", "b", "b"]);
  });

  it("still assigns a tattooer with weight 0 if nobody else is free", () => {
    expect(chooseTattooer([m("a", 1, 0), m("b", 0, 0)], ["b"])?.tattooerId).toBe("b");
  });
});

describe("scoreMembers", () => {
  it("reports targets and deficits", () => {
    const [a, b] = scoreMembers([m("a", 3, 2), m("b", 1, 1)]);
    expect(a.share).toBe(0.75);
    expect(a.target).toBe(3);
    expect(a.deficit).toBe(1);
    expect(b.deficit).toBe(0);
  });
});
