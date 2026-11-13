import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import type { StressPayload } from "../types";
import { addQuarters, headline, peakImpact, project } from "./project";

const payload = fixture as unknown as StressPayload;

function expectMatches(actual: ReturnType<typeof project>, expected: { date: string; unrate: number; chargeoff: number }[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((row, i) => {
    expect(row.date).toBe(expected[i].date);
    expect(row.unrate).toBeCloseTo(expected[i].unrate, 3);
    expect(row.chargeoff).toBeCloseTo(expected[i].chargeoff, 3);
  });
}

describe("project: parity with the Python model's published scenarios", () => {
  it("matches the published no-shock baseline", () => {
    expectMatches(project(payload, 0), payload.scenarios.baseline);
  });

  it("matches the published +2pp scenario", () => {
    expectMatches(project(payload, 2), payload.scenarios.shock_2pp);
  });
});

describe("project: rule behaviour", () => {
  it("phases the shock in over the ramp, then holds it", () => {
    const last = payload.last_observed.unrate;
    const rows = project(payload, 4);
    expect(rows[1].unrate).toBeCloseTo(last + 2, 6); // h=2 of 4 quarters: half
    expect(rows[3].unrate).toBeCloseTo(last + 4, 6); // h=4: full
    expect(rows[7].unrate).toBeCloseTo(last + 4, 6); // held
  });

  it("first step follows the formula by hand", () => {
    const { intercept, coefficients: b } = payload.model;
    const u = payload.unrate_history.map((r) => r.unrate);
    const expected = intercept + b.chargeoff_lag1 * payload.last_observed.chargeoff + b.unrate_chg4_lag1 * (u[4] - u[0]);
    expect(project(payload, 3)[0].chargeoff).toBeCloseTo(expected, 10);
  });

  it("higher unemployment never lowers losses (economically expected sign)", () => {
    const base = project(payload, 0);
    let prev = base;
    for (const shock of [1, 2, 3, 4, 5]) {
      const rows = project(payload, shock);
      rows.forEach((r, i) => expect(r.chargeoff).toBeGreaterThanOrEqual(prev[i].chargeoff));
      prev = rows;
    }
    expect(project(payload, 5)[7].chargeoff).toBeGreaterThan(base[7].chargeoff);
  });

  it("does not mutate the payload", () => {
    const before = JSON.stringify(payload.unrate_history);
    project(payload, 5);
    expect(JSON.stringify(payload.unrate_history)).toBe(before);
  });
});

describe("addQuarters", () => {
  it("rolls across year ends", () => {
    expect(addQuarters("2026-04-01", 1)).toBe("2026-07-01");
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});

describe("headline", () => {
  const base = project(payload, 0);

  it("reports the peak gap versus baseline", () => {
    const stressed = project(payload, 2);
    const peak = peakImpact(base, stressed);
    expect(peak.gap).toBeGreaterThan(0);
    const text = headline(2, base, stressed);
    expect(text).toContain("2.0 points");
    expect(text).toContain(peak.gap.toFixed(2));
    expect(text.match(/\./g)!.length).toBeGreaterThanOrEqual(1);
  });

  it("says so when there is no shock", () => {
    expect(headline(0, base, project(payload, 0))).toMatch(/no rise in unemployment/i);
  });
});
