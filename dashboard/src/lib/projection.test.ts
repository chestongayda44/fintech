import { describe, expect, it } from "vitest";
import fixture from "../test/fixtures/stress_payload.json";
import type { StressPayload } from "../types";
import { addQuarters } from "./format";
import { peakGap, project } from "./projection";

const payload = fixture as unknown as StressPayload;

function shockFor(key: string): number {
  if (key === "baseline") return 0;
  const m = /^shock_(\d+(?:\.\d+)?)pp$/.exec(key);
  if (!m) throw new Error(`Unknown scenario key ${key}`);
  return Number(m[1]);
}

describe("project matches the scenarios the Python model published", () => {
  for (const [key, published] of Object.entries(payload.scenarios)) {
    it(key, () => {
      const ours = project(payload, shockFor(key));
      expect(ours.map((r) => r.date)).toEqual(published.map((r) => r.date));
      ours.forEach((r, i) => {
        expect(r.unrate).toBeCloseTo(published[i].unrate, 3);
        expect(r.chargeoff).toBeCloseTo(published[i].chargeoff, 3);
      });
    });
  }

  it("covers both baseline and the default shock", () => {
    expect(Object.keys(payload.scenarios)).toEqual(expect.arrayContaining(["baseline", "shock_2pp"]));
  });
});

describe("project behaviour", () => {
  const { ramp_quarters: ramp } = payload.scenario_defaults;
  const lastU = payload.last_observed.unrate;

  it("phases the shock in over the ramp, then holds", () => {
    const rows = project(payload, 3);
    expect(rows[ramp - 1].unrate).toBeCloseTo(lastU + 3, 10);
    for (const r of rows.slice(ramp)) expect(r.unrate).toBeCloseTo(lastU + 3, 10);
  });

  it("has zero gap with no shock, and a gap that grows with the shock", () => {
    const base = project(payload, 0);
    expect(peakGap(base, project(payload, 0)).gap).toBe(0);
    let prev = 0;
    for (const s of [1, 2, 3, 4, 5]) {
      const g = peakGap(base, project(payload, s)).gap;
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });

  it("rejects too little unemployment history", () => {
    expect(() => project({ ...payload, unrate_history: payload.unrate_history.slice(1) }, 2)).toThrow(/5 quarters/);
  });
});

describe("addQuarters", () => {
  it("rolls over the year", () => {
    expect(addQuarters("2026-10-01", 1)).toBe("2027-01-01");
    expect(addQuarters("2026-04-01", 8)).toBe("2028-04-01");
  });
});
