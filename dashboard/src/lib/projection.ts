import type { ScenarioRow, StressPayload } from "../types";

/** "2026-04-01" + 2 quarters -> "2026-10-01" */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const months = y * 12 + (m - 1) + 3 * n;
  return `${Math.floor(months / 12)}-${String((months % 12) + 1).padStart(2, "0")}-01`;
}

/**
 * Contract projection rule (docs/DATA_CONTRACT.md); mirrors risk_model.model.project.
 * Unemployment rises by shockPp, phased in linearly over `ramp` quarters, then holds.
 */
export function project(
  payload: StressPayload,
  shockPp: number,
  horizon = payload.scenario_defaults.horizon_quarters,
  ramp = payload.scenario_defaults.ramp_quarters,
): ScenarioRow[] {
  const { intercept, coefficients } = payload.model;
  const b1 = coefficients.chargeoff_lag1;
  const b2 = coefficients.unrate_chg4_lag1;
  const u = payload.unrate_history.slice(-5).map((r) => r.unrate);
  const lastU = payload.last_observed.unrate;
  let co = payload.last_observed.chargeoff;
  const out: ScenarioRow[] = [];
  for (let h = 1; h <= horizon; h++) {
    u.push(lastU + shockPp * Math.min(h / ramp, 1));
    co = intercept + b1 * co + b2 * (u[u.length - 2] - u[u.length - 6]); // u_{h-1} - u_{h-5}
    out.push({ date: addQuarters(payload.last_observed.date, h), unrate: u[u.length - 1], chargeoff: co });
  }
  return out;
}

export interface PeakGap {
  date: string;
  gap: number;
  baseline: number;
  stressed: number;
}

/** Quarter where the stressed path sits furthest above the no-shock path. */
export function peakGap(baseline: ScenarioRow[], stressed: ScenarioRow[]): PeakGap {
  let best: PeakGap = { date: stressed[0].date, gap: -Infinity, baseline: 0, stressed: 0 };
  stressed.forEach((s, i) => {
    const gap = s.chargeoff - baseline[i].chargeoff;
    if (gap > best.gap + 1e-12) best = { date: s.date, gap, baseline: baseline[i].chargeoff, stressed: s.chargeoff };
  });
  return best;
}
