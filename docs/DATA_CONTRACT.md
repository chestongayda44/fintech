# Data contract — published artifacts

Published by `risk_model.storage.publish()` to
`gs://$GCS_BUCKET/$GCS_PREFIX/` (DATA_SOURCE=gcs) or `data/published/` (DATA_SOURCE=local).
Consumers: the dashboard (SWE) and the freshness checker (SRE).

## `macro_panel.csv`
Quarterly panel, one row per quarter, sorted ascending, no gaps in the quarter sequence
(a quarter with missing data appears with empty cells rather than being dropped).

| column | type | source | notes |
|---|---|---|---|
| `date` | `YYYY-MM-DD` | — | first day of quarter |
| `delinquency` | float, % | DRCCLACBS | credit card delinquency rate |
| `chargeoff` | float, % | CORCCACBS | credit card charge-off rate — **the stress model's target** |
| `unrate` | float, % | UNRATE | quarterly mean of available monthly values (≥2 of 3) |
| `fedfunds` | float, % | FEDFUNDS | quarterly mean of available monthly values (≥2 of 3) |
| `cpi_yoy` | float, % | CPIAUCSL | year-over-year % change of quarterly mean |

## `stress_payload.json` (schema_version 2)
Everything the dashboard needs to recompute projections client-side for any shock.

```json
{
  "schema_version": 2,
  "generated_at": "2026-11-11T14:00:00Z",
  "source": "FRED",
  "series": {"chargeoff": "CORCCACBS", "delinquency": "DRCCLACBS", "unrate": "UNRATE"},
  "model": {
    "type": "OLS",
    "target": "chargeoff",
    "formula": "chargeoff_t = intercept + b1*chargeoff_{t-1} + b2*(unrate_{t-1} - unrate_{t-5})",
    "intercept": 0.0,
    "coefficients": {"chargeoff_lag1": 0.0, "unrate_chg4_lag1": 0.0},
    "r_squared": 0.0,
    "n_obs": 0,
    "sample_start": "YYYY-MM-DD",
    "sample_end": "YYYY-MM-DD",
    "excluded": [{"start": "2020-04-01", "end": "2021-12-31", "reason": "pandemic: stimulus and forbearance broke the usual unemployment-loss link"}]
  },
  "last_observed": {"date": "YYYY-MM-DD", "chargeoff": 0.0, "delinquency": 0.0, "unrate": 0.0},
  "unrate_history": [{"date": "YYYY-MM-DD", "unrate": 0.0}],
  "scenario_defaults": {"horizon_quarters": 8, "ramp_quarters": 4, "shock_pp": 2.0},
  "history": [{"date": "YYYY-MM-DD", "chargeoff": 0.0, "delinquency": 0.0, "unrate": 0.0}],
  "scenarios": {
    "baseline":  [{"date": "YYYY-MM-DD", "unrate": 0.0, "chargeoff": 0.0}],
    "shock_2pp": [{"date": "YYYY-MM-DD", "unrate": 0.0, "chargeoff": 0.0}]
  }
}
```

`unrate_history` holds the last 5 observed quarters (oldest first), ending at `last_observed`.

### Projection rule (dashboard must match `risk_model.model.project`)
Let `u` be `unrate_history` values followed by the projected path. For quarter h = 1..H:
- `u_h = last.unrate + shock_pp * min(h / ramp_quarters, 1)`
- `chargeoff_h = intercept + b1*chargeoff_{h-1} + b2*(u_{h-1} - u_{h-5})`
  with `chargeoff_0 = last.chargeoff` and `u_0 = last.unrate`.

Headline the **gap between shock and baseline**; the baseline itself drifts toward the model's
long-run mean. Illustrative scenario output, not a forecast.
