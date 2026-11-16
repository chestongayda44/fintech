import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import type { ScenarioRow, StressPayload } from "../types";
import { addQuarters, peakGap, project } from "./projection";

const payload = fixture as unknown as StressPayload;

function expectMatches(actual: ScenarioRow[], published: ScenarioRow[]) {
  expect(actual).toHaveLength(published.length);
  actual.forEach((row, i) => {
    expect(row.date).toBe(published[i].date);
    // Published values are rounded to 4 decimals.
    expect(row.unrate).toBeCloseTo(published[i].unrate, 3);
    expect(row.chargeoff).toBeCloseTo(published[i].chargeoff, 3);
  });
}

describe("project matches the Python model's published scenarios", () => {
  it("baseline (no shock)", () => {
    expectMatches(project(payload, 0), payload.scenarios.baseline);
  });

  it("default shock", () => {
    expectMatches(project(payload, payload.scenario_defaults.shock_pp), payload.scenarios.shock_2pp);
  });
});

// The payload the Python pipeline currently publishes (fixture above may be from an earlier run).
const published = JSON.parse(
  readFileSync(new URL("../../../data/published/stress_payload.json", import.meta.url), "utf8"),
) as StressPayload;

describe("project matches the currently published payload", () => {
  it("baseline and default shock", () => {
    expectMatches(project(published, 0), published.scenarios.baseline);
    expectMatches(project(published, published.scenario_defaults.shock_pp), published.scenarios.shock_2pp);
  });
});

describe("project mechanics", () => {
  it("shock reaches charge-offs with a one-quarter lag", () => {
    expect(project(payload, 5)[0].chargeoff).toBeCloseTo(project(payload, 0)[0].chargeoff, 10);
  });

  it("phases unemployment in over the ramp, then holds", () => {
    const u0 = payload.last_observed.unrate;
    const path = project(payload, 4).map((r) => r.unrate - u0);
    [1, 2, 3, 4, 4, 4, 4, 4].forEach((v, i) => expect(path[i]).toBeCloseTo(v, 10));
  });

  it("steps dates by quarter across year ends", () => {
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});

describe("peakGap", () => {
  it("finds the quarter of largest stressed-minus-baseline gap", () => {
    const base = payload.scenarios.baseline;
    const stressed = payload.scenarios.shock_2pp;
    const gaps = stressed.map((s, i) => s.chargeoff - base[i].chargeoff);
    const p = peakGap(base, stressed);
    expect(p.gap).toBeCloseTo(Math.max(...gaps), 10);
    expect(p.date).toBe(stressed[gaps.indexOf(Math.max(...gaps))].date);
  });

  it("is zero with no shock", () => {
    expect(peakGap(project(payload, 0), project(payload, 0)).gap).toBe(0);
  });
});
