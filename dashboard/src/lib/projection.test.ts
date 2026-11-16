import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import type { ScenarioRow, StressPayload } from "../types";
import { addQuarters, peakImpact, project } from "./projection";

const payload = fixture as unknown as StressPayload;

function expectMatches(actual: ScenarioRow[], published: ScenarioRow[]) {
  expect(actual).toHaveLength(published.length);
  actual.forEach((row, i) => {
    expect(row.date).toBe(published[i].date);
    // Python publishes values rounded to 4 dp.
    expect(row.unrate).toBeCloseTo(published[i].unrate, 3);
    expect(row.chargeoff).toBeCloseTo(published[i].chargeoff, 3);
  });
}

describe("project matches the scenarios the Python model published", () => {
  it("baseline (no shock)", () => {
    expectMatches(project(payload, 0), payload.scenarios.baseline);
  });

  it("+2pp shock", () => {
    expectMatches(project(payload, 2), payload.scenarios.shock_2pp);
  });

  it("every published shock_<N>pp scenario", () => {
    const keys = Object.keys(payload.scenarios).filter((k) => /^shock_[\d.]+pp$/.test(k));
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expectMatches(project(payload, Number(k.slice(6, -2))), payload.scenarios[k]);
  });
});

describe("projection behaviour", () => {
  it("phases the shock in over the ramp, then holds it", () => {
    const u = project(payload, 4).map((r) => r.unrate - payload.last_observed.unrate);
    expect(u.slice(0, 4).map((v) => +v.toFixed(6))).toEqual([1, 2, 3, 4]);
    expect(u.slice(4).every((v) => Math.abs(v - 4) < 1e-9)).toBe(true);
  });

  it("first stressed quarter equals baseline (unemployment enters with a lag)", () => {
    expect(project(payload, 3)[0].chargeoff).toBeCloseTo(project(payload, 0)[0].chargeoff, 10);
  });

  it("bigger shocks mean bigger peak impact; no shock means none", () => {
    const base = project(payload, 0);
    const gaps = [0, 1, 2.5, 5].map((s) => peakImpact(base, project(payload, s)).gapPp);
    expect(gaps[0]).toBe(0);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
  });

  it("rejects an incomplete unemployment history", () => {
    const short = { ...payload, unrate_history: payload.unrate_history.slice(1) };
    expect(() => project(short, 2)).toThrow(/5 observed quarters/);
    const gap = { ...payload, unrate_history: payload.unrate_history.map((r, i) => (i === 2 ? { ...r, unrate: null } : r)) };
    expect(() => project(gap as unknown as StressPayload, 2)).toThrow(/missing/);
  });

  it("steps quarters across year ends", () => {
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});
