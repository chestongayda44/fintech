import type { ScenarioRow, StressPayload } from "../types";

/** "2026-04-01" + 1 -> "2026-07-01" (dates are first day of quarter). */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const idx = y * 4 + Math.floor((m - 1) / 3) + n;
  const year = Math.floor(idx / 4);
  const month = (idx % 4) * 3 + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/**
 * Projection rule from docs/DATA_CONTRACT.md; mirrors risk_model.model.project.
 * u = last 5 observed unemployment quarters followed by the projected path.
 *   u_h        = u_0 + shock * min(h / ramp, 1)
 *   chargeoff_h = intercept + b1*chargeoff_{h-1} + b2*(u_{h-1} - u_{h-5})
 */
export function project(
  payload: StressPayload,
  shockPp: number,
  horizon: number = payload.scenario_defaults.horizon_quarters,
  ramp: number = payload.scenario_defaults.ramp_quarters,
): ScenarioRow[] {
  const { intercept, coefficients } = payload.model;
  const u = payload.unrate_history.slice(-5).map((r) => r.unrate);
  const u0 = u[u.length - 1];
  let co = payload.last_observed.chargeoff;
  const out: ScenarioRow[] = [];
  for (let h = 1; h <= horizon; h++) {
    co = intercept + coefficients.chargeoff_lag1 * co + coefficients.unrate_chg4_lag1 * (u[u.length - 1] - u[u.length - 5]);
    u.push(u0 + shockPp * Math.min(h / ramp, 1));
    out.push({ date: addQuarters(payload.last_observed.date, h), unrate: u[u.length - 1], chargeoff: co });
  }
  return out;
}

/** Largest stressed-minus-baseline charge-off gap and when it occurs. */
export function peakGap(baseline: ScenarioRow[], stressed: ScenarioRow[]): { gap: number; date: string; chargeoff: number } {
  let best = { gap: -Infinity, date: stressed[0]?.date ?? "", chargeoff: stressed[0]?.chargeoff ?? NaN };
  stressed.forEach((row, i) => {
    const gap = row.chargeoff - baseline[i].chargeoff;
    if (gap > best.gap) best = { gap, date: row.date, chargeoff: row.chargeoff };
  });
  return best;
}
