import type { StressPayload } from "../types";

export interface ProjectionPoint {
  date: string; // first day of quarter
  unrate: number;
  chargeoff: number;
}

/** Quarter-start date `h` quarters after `date` ("2026-04-01", 3 -> "2027-01-01"). */
export function addQuarters(date: string, h: number): string {
  const [y, m] = date.split("-").map(Number);
  const q = y * 4 + Math.floor((m - 1) / 3) + h;
  return `${Math.floor(q / 4)}-${String((q % 4) * 3 + 1).padStart(2, "0")}-01`;
}

/**
 * Project charge-offs under an unemployment shock, exactly per docs/DATA_CONTRACT.md
 * (and risk_model.model.project):
 *   u_h          = last.unrate + shock * min(h / ramp, 1)
 *   chargeoff_h  = a + b1 * chargeoff_{h-1} + b2 * (u_{h-1} - u_{h-5})
 * where u starts as the last 5 observed quarters of unemployment.
 */
export function project(
  payload: StressPayload,
  shockPp: number,
  horizon = payload.scenario_defaults.horizon_quarters,
  ramp = payload.scenario_defaults.ramp_quarters,
): ProjectionPoint[] {
  if (horizon < 1 || ramp < 1) throw new Error("horizon and ramp must be >= 1");
  const { intercept: a, coefficients: b } = payload.model;
  const last = payload.last_observed;
  const u = payload.unrate_history.map((r) => r.unrate);
  if (u.length < 5) throw new Error("unrate_history needs the last 5 quarters");

  let chargeoff = last.chargeoff;
  const out: ProjectionPoint[] = [];
  for (let h = 1; h <= horizon; h++) {
    const n = u.length;
    chargeoff = a + b.chargeoff_lag1 * chargeoff + b.unrate_chg4_lag1 * (u[n - 1] - u[n - 5]);
    u.push(last.unrate + shockPp * Math.min(h / ramp, 1));
    out.push({ date: addQuarters(last.date, h), unrate: u[u.length - 1], chargeoff });
  }
  return out;
}

export interface StressImpact {
  peakGap: number; // percentage points, shock minus baseline
  peakDate: string;
  shockAtPeak: number;
  baselineAtPeak: number;
}

/** Where the shocked path sits furthest above the baseline. */
export function stressImpact(baseline: ProjectionPoint[], shocked: ProjectionPoint[]): StressImpact {
  let best = 0;
  for (let i = 1; i < shocked.length; i++) {
    if (shocked[i].chargeoff - baseline[i].chargeoff > shocked[best].chargeoff - baseline[best].chargeoff) best = i;
  }
  return {
    peakGap: shocked[best].chargeoff - baseline[best].chargeoff,
    peakDate: shocked[best].date,
    shockAtPeak: shocked[best].chargeoff,
    baselineAtPeak: baseline[best].chargeoff,
  };
}
