import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import { parsePayload } from "./payload";
import { addQuarters, project, stressGap } from "./projection";
import type { ScenarioRow } from "../types";

const payload = parsePayload(fixture);
// Payload rounds coefficients to 6 dp and values to 4 dp, so allow ~1e-3.
const TOL = 1e-3;

function expectMatches(actual: ScenarioRow[], published: ScenarioRow[]) {
  expect(actual).toHaveLength(published.length);
  actual.forEach((row, i) => {
    expect(row.date).toBe(published[i].date);
    expect(Math.abs(row.unrate - published[i].unrate)).toBeLessThan(TOL);
    expect(Math.abs(row.chargeoff - published[i].chargeoff)).toBeLessThan(TOL);
  });
}

describe("project matches the Python model's published scenarios", () => {
  it("no-shock path equals scenarios.baseline", () => {
    expectMatches(project(payload, 0), payload.scenarios.baseline);
  });

  it("+2pp path equals scenarios.shock_2pp", () => {
    expectMatches(project(payload, 2), payload.scenarios.shock_2pp);
  });
});

describe("projection mechanics", () => {
  it("shock hits charge-offs with a one-quarter lag", () => {
    expect(project(payload, 5)[0].chargeoff).toBeCloseTo(project(payload, 0)[0].chargeoff, 10);
  });

  it("phases unemployment in over the ramp, then holds", () => {
    const u = project(payload, 4).map((r) => r.unrate - payload.last_observed.unrate);
    expect(u.slice(0, 4).map((x) => +x.toFixed(6))).toEqual([1, 2, 3, 4]);
    expect(u.slice(4).every((x) => Math.abs(x - 4) < 1e-9)).toBe(true);
  });

  it("bigger shocks give bigger peak gaps", () => {
    const base = project(payload, 0);
    const gaps = [0, 1, 2, 3, 4, 5].map((s) => stressGap(base, project(payload, s)).peakGap);
    gaps.slice(1).forEach((g, i) => expect(g).toBeGreaterThan(gaps[i]));
  });

  it("addQuarters rolls over years", () => {
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});

describe("stressGap", () => {
  it("finds the published +2pp peak gap", () => {
    const g = stressGap(payload.scenarios.baseline, payload.scenarios.shock_2pp);
    expect(g.peakDate).toBe("2027-10-01");
    expect(g.peakGap).toBeCloseTo(6.7386 - 4.6657, 4);
  });
});
