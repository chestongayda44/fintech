import type { ScenarioRow, StressPayload } from "../types";
import { pct, points, quarterLabel } from "./format";

/** "2026-04-01" + n quarters -> "YYYY-MM-01" (first day of the quarter). */
export function addQuarters(date: string, n: number): string {
  const [y, m] = date.split("-").map(Number);
  const idx = y * 4 + Math.floor((m - 1) / 3) + n;
  const year = Math.floor(idx / 4);
  const q = idx % 4;
  return `${year}-${String(q * 3 + 1).padStart(2, "0")}-01`;
}

/**
 * Projection rule from docs/DATA_CONTRACT.md; mirrors `risk_model.model.project`.
 *   u_h = last.unrate + shock * min(h / ramp, 1)
 *   chargeoff_h = intercept + b1*chargeoff_{h-1} + b2*(u_{h-1} - u_{h-5})
 */
export function project(
  payload: StressPayload,
  shockPp: number,
  horizon: number = payload.scenario_defaults.horizon_quarters,
  ramp: number = payload.scenario_defaults.ramp_quarters,
): ScenarioRow[] {
  const { intercept, coefficients: coef } = payload.model;
  const u = payload.unrate_history.map((r) => r.unrate); // oldest first, ends at the last observation
  const u0 = u[u.length - 1];
  let c = payload.last_observed.chargeoff;
  const out: ScenarioRow[] = [];
  for (let h = 1; h <= horizon; h++) {
    c = intercept + coef.chargeoff_lag1 * c + coef.unrate_chg4_lag1 * (u[u.length - 1] - u[u.length - 5]);
    u.push(u0 + shockPp * Math.min(h / ramp, 1));
    out.push({ date: addQuarters(payload.last_observed.date, h), unrate: u[u.length - 1], chargeoff: c });
  }
  return out;
}

/** Largest stressed-minus-baseline charge-off gap, and the quarter it occurs in. */
export function peakImpact(baseline: ScenarioRow[], stressed: ScenarioRow[]): { gap: number; date: string; baseline: number; stressed: number } {
  let best = { gap: 0, date: baseline[0]?.date ?? "", baseline: baseline[0]?.chargeoff ?? 0, stressed: stressed[0]?.chargeoff ?? 0 };
  stressed.forEach((s, i) => {
    const gap = s.chargeoff - baseline[i].chargeoff;
    if (gap > best.gap) best = { gap, date: s.date, baseline: baseline[i].chargeoff, stressed: s.chargeoff };
  });
  return best;
}

/** One-sentence headline on the gap between shock and baseline. */
export function headline(shockPp: number, baseline: ScenarioRow[], stressed: ScenarioRow[]): string {
  const peak = peakImpact(baseline, stressed);
  if (shockPp === 0 || peak.gap < 0.005) {
    return "With no rise in unemployment, the stressed path matches the no-shock path.";
  }
  return (
    `A ${points(shockPp)} rise in unemployment lifts card charge-offs by up to ${points(peak.gap, 2)} ` +
    `(${pct(peak.stressed)} vs ${pct(peak.baseline)} with no shock), peaking in ${quarterLabel(peak.date)}.`
  );
}
