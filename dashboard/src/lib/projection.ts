import type { ScenarioRow, StressPayload } from "../types";

/** "2026-04-01" + n quarters -> first day of that quarter. */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const idx = y * 4 + Math.floor((m - 1) / 3) + n;
  return `${Math.floor(idx / 4)}-${String((idx % 4) * 3 + 1).padStart(2, "0")}-01`;
}

/**
 * Projection rule from docs/DATA_CONTRACT.md; mirrors risk_model.model.project.
 * Unemployment rises by shockPp, phased in linearly over `ramp` quarters.
 */
export function project(
  payload: StressPayload,
  shockPp: number,
  horizon = payload.scenario_defaults.horizon_quarters,
  ramp = payload.scenario_defaults.ramp_quarters,
): ScenarioRow[] {
  const { intercept: a, coefficients } = payload.model;
  const b1 = coefficients.chargeoff_lag1;
  const b2 = coefficients.unrate_chg4_lag1;
  const u = payload.unrate_history.map((r) => r.unrate);
  if (u.length < 5) throw new Error("unrate_history must hold the last 5 quarters");
  const lastU = payload.last_observed.unrate;
  let co = payload.last_observed.chargeoff;
  const rows: ScenarioRow[] = [];
  for (let h = 1; h <= horizon; h++) {
    co = a + b1 * co + b2 * (u[u.length - 1] - u[u.length - 5]);
    u.push(lastU + shockPp * Math.min(h / ramp, 1));
    rows.push({ date: addQuarters(payload.last_observed.date, h), unrate: u[u.length - 1], chargeoff: co });
  }
  return rows;
}

export interface StressGap {
  peakGap: number;
  peakDate: string;
  peakStressed: number;
}

/** Largest stressed-minus-baseline charge-off gap over the horizon. */
export function stressGap(baseline: ScenarioRow[], stressed: ScenarioRow[]): StressGap {
  let best: StressGap = { peakGap: -Infinity, peakDate: "", peakStressed: NaN };
  stressed.forEach((s, i) => {
    const gap = s.chargeoff - baseline[i].chargeoff;
    if (gap > best.peakGap) best = { peakGap: gap, peakDate: s.date, peakStressed: s.chargeoff };
  });
  return best;
}
