import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import { parsePayload } from "./payload";
import { addQuarters, project, stressImpact } from "./projection";

// A real payload published by the Python pipeline (risk_model) from FRED data through 2026 Q2.
const payload = parsePayload(fixture);

describe("project() matches the Python model", () => {
  it("reproduces the published baseline scenario", () => {
    const ts = project(payload, 0);
    payload.scenarios.baseline.forEach((py, i) => {
      expect(ts[i].date).toBe(py.date);
      expect(ts[i].unrate).toBeCloseTo(py.unrate, 3);
      expect(ts[i].chargeoff).toBeCloseTo(py.chargeoff, 3);
    });
  });

  it("reproduces the published +2pp shock scenario", () => {
    const ts = project(payload, 2);
    payload.scenarios.shock_2pp.forEach((py, i) => {
      expect(ts[i].date).toBe(py.date);
      expect(ts[i].unrate).toBeCloseTo(py.unrate, 3);
      expect(ts[i].chargeoff).toBeCloseTo(py.chargeoff, 3);
    });
  });
});

describe("project() mechanics", () => {
  it("ramps unemployment over the ramp quarters, then holds", () => {
    const p = project(payload, 2);
    const u0 = payload.last_observed.unrate;
    expect(p[1].unrate).toBeCloseTo(u0 + 1, 6); // 2/4 of the way
    expect(p[3].unrate).toBeCloseTo(u0 + 2, 6);
    expect(p[7].unrate).toBeCloseTo(u0 + 2, 6);
  });

  it("responds with a one-quarter lag", () => {
    expect(project(payload, 3)[0].chargeoff).toBeCloseTo(project(payload, 0)[0].chargeoff, 9);
  });

  it("a bigger shock means a bigger peak impact", () => {
    const base = project(payload, 0);
    const gaps = [0.5, 1, 2, 4].map((s) => stressImpact(base, project(payload, s)).peakGap);
    gaps.slice(1).forEach((g, i) => expect(g).toBeGreaterThan(gaps[i]));
  });

  it("no shock means no stress impact", () => {
    const base = project(payload, 0);
    expect(stressImpact(base, base).peakGap).toBe(0);
  });

  it("rejects a bad horizon", () => {
    expect(() => project(payload, 1, 0)).toThrow();
  });
});

describe("stressImpact()", () => {
  it("finds the +2pp peak: about 2 points above baseline, 6 quarters out", () => {
    const impact = stressImpact(project(payload, 0), project(payload, 2));
    expect(impact.peakGap).toBeGreaterThan(1.5);
    expect(impact.peakGap).toBeLessThan(2.5);
    expect(impact.peakDate).toBe(addQuarters(payload.last_observed.date, 6));
  });
});

describe("addQuarters()", () => {
  it("rolls over year ends", () => {
    expect(addQuarters("2026-04-01", 1)).toBe("2026-07-01");
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});
