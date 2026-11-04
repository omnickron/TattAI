import { describe, expect, it } from "vitest";
import {
  attributedTattooer,
  buildReport,
  rate,
  type ReportConsultation,
  type ReportLead,
} from "./report";

const NOW = new Date("2026-11-20T12:00:00Z");
let n = 0;

function c(overrides: Partial<ReportConsultation> = {}): ReportConsultation {
  return {
    tattooerId: "alex",
    status: "HELD",
    startsAt: new Date("2026-11-05T10:00:00Z"),
    tattooBooked: null,
    sessions: [],
    ...overrides,
  };
}

function lead(
  createdAt: string,
  consultations: ReportConsultation[] = [],
  campaign: string | null = "c1",
): ReportLead {
  return {
    id: `l${n++}`,
    createdAt: new Date(createdAt),
    campaignId: campaign,
    campaignName: campaign ? `Kampagne ${campaign}` : null,
    source: "META_LEAD_AD",
    consultations,
  };
}

const session = (date: string, amountCents: number | null, cancelled = false) => ({
  date: new Date(date),
  amountCents,
  cancelled,
});

const opts = { now: NOW, from: "2026-11-01", to: "2026-11-30" };

describe("buildReport", () => {
  it("counts walk-in tattoos as won with revenue, but not as consultations", () => {
    const report = buildReport(
      [
        lead("2026-11-02T10:00:00Z", [
          c({
            walkIn: true,
            tattooBooked: true,
            sessions: [session("2026-11-10T00:00:00Z", 30000)],
          }),
        ]),
      ],
      opts,
    );
    expect(report.totals).toMatchObject({
      leads: 1,
      booked: 0,
      held: 0,
      won: 1,
      sessions: 1,
      revenueCents: 30000,
    });
    expect(report.byTattooer).toHaveLength(1);
  });

  it("counts the funnel per lead and sums revenue of non-cancelled sessions", () => {
    const report = buildReport(
      [
        lead("2026-11-02T10:00:00Z"), // no consultation
        lead("2026-11-03T10:00:00Z", [c({ status: "NO_SHOW" })]),
        lead("2026-11-04T10:00:00Z", [c({ tattooBooked: false })]),
        lead("2026-11-05T10:00:00Z", [
          c({
            tattooBooked: true,
            sessions: [
              session("2026-11-15T00:00:00Z", 60000),
              session("2026-12-15T00:00:00Z", 60000),
              session("2026-12-20T00:00:00Z", null),
              session("2026-12-22T00:00:00Z", 90000, true),
            ],
          }),
        ]),
        lead("2026-11-06T10:00:00Z", [
          c({ status: "SCHEDULED", startsAt: new Date("2026-11-19T10:00:00Z") }),
        ]),
      ],
      opts,
    );
    expect(report.totals).toEqual({
      leads: 5,
      booked: 4,
      held: 2,
      noShow: 1,
      won: 1,
      open: 1,
      sessions: 3,
      revenueCents: 120000,
      revenueRealizedCents: 60000,
      missingAmounts: 1,
    });
  });

  it("does not double count rescheduled or reassigned consultations", () => {
    const l = lead("2026-11-02T10:00:00Z", [
      c({ status: "CANCELLED", tattooerId: "alex", startsAt: new Date("2026-11-04T10:00:00Z") }),
      c({
        status: "HELD",
        tattooerId: "kim",
        startsAt: new Date("2026-11-06T10:00:00Z"),
        tattooBooked: true,
      }),
    ]);
    expect(attributedTattooer(l)).toBe("kim");
    const report = buildReport([l], opts);
    expect(report.totals).toMatchObject({ booked: 1, held: 1, won: 1 });
    expect(report.byTattooer.map((t) => t.key)).toEqual(["kim"]);
  });

  it("filters by tattooer via attribution", () => {
    const report = buildReport(
      [
        lead("2026-11-02T10:00:00Z", [c({ tattooerId: "alex" })]),
        lead("2026-11-03T10:00:00Z", [c({ tattooerId: "kim" })]),
      ],
      { ...opts, tattooerId: "kim" },
    );
    expect(report.totals.leads).toBe(1);
  });

  it("groups by campaign and by week (Berlin time)", () => {
    const report = buildReport(
      [
        lead("2026-11-01T23:30:00Z", [], "c1"), // Monday 2 Nov 00:30 in Berlin → week of 2 Nov
        lead("2026-11-08T10:00:00Z", [], "c2"), // Sunday → week of 2 Nov
        lead("2026-11-09T10:00:00Z", [], null),
      ],
      opts,
    );
    expect(report.granularity).toBe("week");
    expect(report.series.map((s) => [s.key, s.metrics.leads])).toEqual([
      ["2026-10-26", 0],
      ["2026-11-02", 2],
      ["2026-11-09", 1],
      ["2026-11-16", 0],
      ["2026-11-23", 0],
      ["2026-11-30", 0],
    ]);
    expect(report.byCampaign.map((x) => x.label).sort()).toEqual([
      "Kampagne c1",
      "Kampagne c2",
      "Ohne Kampagne",
    ]);
  });

  it("uses months for long periods", () => {
    const report = buildReport([lead("2026-03-10T10:00:00Z")], {
      ...opts,
      from: "2026-01-01",
      to: "2026-12-31",
    });
    expect(report.granularity).toBe("month");
    expect(report.series).toHaveLength(12);
    expect(report.series[2].metrics.leads).toBe(1);
  });
});

describe("rate", () => {
  it("returns null for an empty base", () => {
    expect(rate(1, 0)).toBeNull();
    expect(rate(1, 4)).toBe(0.25);
  });
});
