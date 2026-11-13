import type { ScenarioRow, StressPayload } from "../types";
import { addQuarters } from "./format";

export interface ProjectOptions {
  horizon?: number;
  ramp?: number;
}

/**
 * Project charge-offs under an unemployment shock. Port of risk_model.model.project;
 * follows the projection rule in docs/DATA_CONTRACT.md. Keep the two in sync.
 */
export function project(payload: StressPayload, shockPp: number, opts: ProjectOptions = {}): ScenarioRow[] {
  const horizon = opts.horizon ?? payload.scenario_defaults.horizon_quarters;
  const ramp = opts.ramp ?? payload.scenario_defaults.ramp_quarters;
  if (horizon < 1 || ramp < 1) throw new Error("horizon and ramp must be >= 1");
  if (payload.unrate_history.length < 5) throw new Error("unrate_history needs the last 5 quarters");

  const { intercept, coefficients: b } = payload.model;
  const u = payload.unrate_history.slice(-5).map((r) => r.unrate);
  const lastU = u[u.length - 1];
  let co = payload.last_observed.chargeoff;
  const rows: ScenarioRow[] = [];
  for (let h = 1; h <= horizon; h++) {
    const chg4Lag1 = u[u.length - 1] - u[u.length - 5];
    co = intercept + b.chargeoff_lag1 * co + b.unrate_chg4_lag1 * chg4Lag1;
    const uh = lastU + shockPp * Math.min(h / ramp, 1);
    u.push(uh);
    rows.push({ date: addQuarters(payload.last_observed.date, h), unrate: uh, chargeoff: co });
  }
  return rows;
}

/** Largest stressed-minus-baseline charge-off gap and the quarter it occurs in. */
export function peakGap(baseline: ScenarioRow[], stressed: ScenarioRow[]): { gap: number; index: number } {
  let best = { gap: 0, index: 0 };
  stressed.forEach((s, i) => {
    const gap = s.chargeoff - baseline[i].chargeoff;
    if (gap > best.gap) best = { gap, index: i };
  });
  return best;
}
