import { describe, expect, it } from "vitest";
import { workerHealth, WORKER_STALE_MS } from "./health";

const now = new Date("2026-11-12T15:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);
const row = (r: Partial<Parameters<typeof workerHealth>[0] & object>) => ({
  startedAt: null,
  lastTickAt: null,
  failures: null,
  crashedAt: null,
  crashError: null,
  ...r,
});

describe("worker health", () => {
  it("warns when the worker never reported", () => {
    expect(workerHealth(null, now).state).toBe("never");
    expect(workerHealth(row({}), now).state).toBe("never");
  });

  it("is fine with a recent run without failures", () => {
    expect(workerHealth(row({ lastTickAt: ago(40_000), failures: [] }), now)).toEqual({
      state: "ok",
      lastTickAt: ago(40_000),
    });
  });

  it("lists failing jobs of a recent run", () => {
    const h = workerHealth(
      row({ lastTickAt: ago(10_000), failures: [{ job: "calendar", message: "401" }] }),
      now,
    );
    expect(h).toMatchObject({ state: "failing", failures: [{ job: "calendar" }] });
  });

  it("warns when the last run is too old, with the crash that followed it", () => {
    const h = workerHealth(
      row({
        lastTickAt: ago(WORKER_STALE_MS + 1000),
        startedAt: ago(30_000),
        crashedAt: ago(20_000),
        crashError: "ReferenceError: boom",
      }),
      now,
    );
    expect(h).toMatchObject({ state: "stale", crash: { message: "ReferenceError: boom" } });
  });

  it("ignores an old crash from before the last good run", () => {
    const h = workerHealth(
      row({
        lastTickAt: ago(WORKER_STALE_MS + 60_000),
        crashedAt: ago(WORKER_STALE_MS + 120_000),
        crashError: "old",
      }),
      now,
    );
    expect(h).toMatchObject({ state: "stale", crash: null });
  });

  it("warns when the worker starts but never completes a run (crash loop)", () => {
    expect(workerHealth(row({ startedAt: ago(5_000) }), now).state).toBe("stale");
  });
});
