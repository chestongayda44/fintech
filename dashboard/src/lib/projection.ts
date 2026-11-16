import type { ScenarioRow, StressPayload } from "../types";

/** "2026-04-01" + 1 -> "2026-07-01" (dates are first day of quarter). */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const idx = y * 4 + Math.floor((m - 1) / 3) + n;
  return `${Math.floor(idx / 4)}-${String((idx % 4) * 3 + 1).padStart(2, "0")}-01`;
}

/** u_h = last + shock_pp * min(h / ramp, 1), for h = 1..horizon. Mirrors risk_model.model.ramp_path. */
export function rampPath(lastUnrate: number, shockPp: number, horizon: number, ramp: number): number[] {
  return Array.from({ length: horizon }, (_, i) => lastUnrate + shockPp * Math.min((i + 1) / ramp, 1));
}

/** Contract projection rule (docs/DATA_CONTRACT.md); must match risk_model.model.project. */
export function project(payload: StressPayload, shockPp: number): ScenarioRow[] {
  const { horizon_quarters: horizon, ramp_quarters: ramp } = payload.scenario_defaults;
  const hist = payload.unrate_history.map((r) => r.unrate);
  if (hist.length !== 5 || hist.some((v) => typeof v !== "number" || !Number.isFinite(v))) {
    throw new Error("unrate_history must be the last 5 observed quarters, with no missing values");
  }
  const { intercept, coefficients } = payload.model;
  const b1 = coefficients.chargeoff_lag1;
  const b2 = coefficients.unrate_chg4_lag1;
  const last = payload.last_observed;
  const path = rampPath(hist[4], shockPp, horizon, ramp);
  const u = [...hist, ...path]; // u[4] is u_0
  const rows: ScenarioRow[] = [];
  let prev = last.chargeoff;
  for (let h = 1; h <= horizon; h++) {
    prev = intercept + b1 * prev + b2 * (u[4 + h - 1] - u[4 + h - 5]);
    rows.push({ date: addQuarters(last.date, h), unrate: path[h - 1], chargeoff: prev });
  }
  return rows;
}

/** Largest gap between stressed and baseline charge-offs (percentage points), and when it occurs. */
export function peakImpact(baseline: ScenarioRow[], stressed: ScenarioRow[]): { gapPp: number; date: string } {
  let best = { gapPp: 0, date: stressed[0]?.date ?? "" };
  stressed.forEach((r, i) => {
    const gap = r.chargeoff - baseline[i].chargeoff;
    if (gap > best.gapPp) best = { gapPp: gap, date: r.date };
  });
  return best;
}

/** Steady state of the AR(1) with no unemployment change: intercept / (1 - b1). */
export function longRunChargeoff(payload: StressPayload): number {
  return payload.model.intercept / (1 - payload.model.coefficients.chargeoff_lag1);
}
