import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import type { ScenarioRow, StressPayload } from "../types";
import { parsePayload } from "./payload";
import { addQuarters, peakGap, project } from "./projection";

const payload: StressPayload = parsePayload(fixture);

function expectMatches(actual: ScenarioRow[], published: ScenarioRow[]) {
  expect(actual).toHaveLength(published.length);
  actual.forEach((row, i) => {
    expect(row.date).toBe(published[i].date);
    // Python publishes values rounded to 4 dp.
    expect(row.unrate).toBeCloseTo(published[i].unrate, 3);
    expect(row.chargeoff).toBeCloseTo(published[i].chargeoff, 3);
  });
}

describe("project (parity with risk_model.model.project)", () => {
  it("matches the published baseline scenario", () => {
    expectMatches(project(payload, 0), payload.scenarios.baseline);
  });

  it("matches the published +2pp shock scenario", () => {
    expectMatches(project(payload, 2), payload.scenarios.shock_2pp);
  });

  it("phases the shock in over the ramp, then holds it", () => {
    const u0 = payload.last_observed.unrate;
    const path = project(payload, 4);
    expect(path[0].unrate).toBeCloseTo(u0 + 1, 6);
    expect(path[3].unrate).toBeCloseTo(u0 + 4, 6);
    expect(path[7].unrate).toBeCloseTo(u0 + 4, 6);
  });
});

describe("peakGap", () => {
  const baseline = project(payload, 0);

  it("is zero with no shock", () => {
    expect(peakGap(baseline, baseline).gap).toBe(0);
  });

  it("grows with the shock (higher unemployment -> higher losses)", () => {
    const g2 = peakGap(baseline, project(payload, 2)).gap;
    const g5 = peakGap(baseline, project(payload, 5)).gap;
    expect(g2).toBeGreaterThan(0);
    expect(g5).toBeGreaterThan(g2);
  });

  it("reports the quarter of the peak gap", () => {
    const stressed = project(payload, 2);
    const gaps = stressed.map((r, i) => r.chargeoff - baseline[i].chargeoff);
    const i = gaps.indexOf(Math.max(...gaps));
    expect(peakGap(baseline, stressed).date).toBe(stressed[i].date);
  });
});

describe("addQuarters", () => {
  it("rolls over year ends", () => {
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});
