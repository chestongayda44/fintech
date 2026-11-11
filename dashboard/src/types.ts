/** Stress payload published by risk_model (schema_version 2). See docs/DATA_CONTRACT.md. */

export interface HistoryRow {
  date: string; // YYYY-MM-DD, first day of quarter
  chargeoff: number | null;
  delinquency: number | null;
  unrate: number | null;
}

export interface ScenarioRow {
  date: string;
  unrate: number;
  chargeoff: number;
}

export interface StressPayload {
  schema_version: 2;
  generated_at: string;
  source: string;
  series: Record<string, string>;
  model: {
    type: string;
    target: "chargeoff";
    formula: string;
    intercept: number;
    coefficients: { chargeoff_lag1: number; unrate_chg4_lag1: number };
    r_squared: number;
    n_obs: number;
    sample_start: string;
    sample_end: string;
    excluded: { start: string; end: string; reason: string }[];
  };
  last_observed: { date: string; chargeoff: number; delinquency?: number; unrate: number };
  unrate_history: { date: string; unrate: number }[];
  scenario_defaults: { horizon_quarters: number; ramp_quarters: number; shock_pp: number };
  history: HistoryRow[];
  scenarios: Record<string, ScenarioRow[]>;
}
