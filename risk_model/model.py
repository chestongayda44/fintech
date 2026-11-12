"""Interpretable stress model for credit card losses.

    chargeoff_t = a + b1*chargeoff_{t-1} + b2*(unrate_{t-1} - unrate_{t-5}) + e_t

Charge-offs respond to unemployment *rising* (the 1-year change), not to unemployment being
high: after 2009 unemployment stayed elevated for years while losses fell as underwriting
tightened and bad loans were written off. A levels model therefore gets the sign wrong.

Pandemic quarters (2020Q2-2021Q4) are excluded from the fit: stimulus and forbearance pushed
losses down while unemployment spiked, which erases the usual relationship.

OLS with HAC (Newey-West) standard errors. Scenario outputs are illustrative, not forecasts.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import statsmodels.api as sm

from risk_model.fred_client import SERIES
from risk_model.transforms import add_features, continuous_quarters

TARGET = "chargeoff"
FEATURES = ["chargeoff_lag1", "unrate_chg4_lag1"]
PANDEMIC = ("2020-04-01", "2021-12-31")
EXCLUSION_REASON = "pandemic: stimulus and forbearance broke the usual unemployment-loss link"


@dataclass(frozen=True)
class FittedModel:
    intercept: float
    coefficients: dict[str, float]
    tvalues: dict[str, float]
    r_squared: float
    n_obs: int
    sample_start: pd.Timestamp
    sample_end: pd.Timestamp
    excluded: list[tuple[str, str]] = field(default_factory=list)
    summary: str = ""

    @property
    def long_run_mean(self) -> float:
        return self.intercept / (1 - self.coefficients["chargeoff_lag1"])


def fit(
    panel: pd.DataFrame,
    start: str | None = "1991-01-01",
    exclude: list[tuple[str, str]] | None = None,
) -> FittedModel:
    exclude = [PANDEMIC] if exclude is None else exclude
    df = add_features(panel)
    if start:
        df = df[df.index >= pd.Timestamp(start)]
    for lo, hi in exclude:
        df = df[~((df.index >= pd.Timestamp(lo)) & (df.index <= pd.Timestamp(hi)))]
    df = df.dropna(subset=[TARGET, *FEATURES])
    if len(df) < 12:
        raise ValueError(f"Need at least 12 quarterly observations to fit, got {len(df)}")
    X = sm.add_constant(df[FEATURES])
    res = sm.OLS(df[TARGET], X).fit(cov_type="HAC", cov_kwds={"maxlags": 4})
    return FittedModel(
        intercept=float(res.params["const"]),
        coefficients={k: float(res.params[k]) for k in FEATURES},
        tvalues={k: float(res.tvalues[k]) for k in FEATURES},
        r_squared=float(res.rsquared),
        n_obs=int(res.nobs),
        sample_start=df.index.min(),
        sample_end=df.index.max(),
        excluded=list(exclude),
        summary=str(res.summary()),
    )


def sanity_check(model: FittedModel) -> list[str]:
    """Economic sanity checks. Returns a list of problems (empty if the model looks sane)."""
    problems = []
    if model.coefficients["unrate_chg4_lag1"] <= 0:
        problems.append("rising unemployment lowers charge-offs (wrong sign)")
    if not 0 <= model.coefficients["chargeoff_lag1"] < 1:
        problems.append("charge-off persistence outside [0, 1): projections will not settle")
    return problems


def project(
    model: FittedModel,
    last_chargeoff: float,
    unrate_history: list[float],
    last_date: pd.Timestamp,
    shock_pp: float = 0.0,
    horizon: int = 8,
    ramp: int = 4,
) -> pd.DataFrame:
    """Project charge-offs for `horizon` quarters under an unemployment shock.

    `unrate_history` is the last 5 observed quarters of unemployment, oldest first.
    Unemployment ramps linearly to last + shock_pp over `ramp` quarters, then holds.
    Must stay in sync with docs/DATA_CONTRACT.md.
    """
    if horizon < 1 or ramp < 1:
        raise ValueError("horizon and ramp must be >= 1")
    if len(unrate_history) < 5:
        raise ValueError("unrate_history needs the last 5 quarters")
    a, b = model.intercept, model.coefficients
    u = list(unrate_history)
    last_u = u[-1]
    co = last_chargeoff
    rows = []
    for h in range(1, horizon + 1):
        chg4_lag1 = u[-1] - u[-5]
        co = a + b["chargeoff_lag1"] * co + b["unrate_chg4_lag1"] * chg4_lag1
        u.append(last_u + shock_pp * min(h / ramp, 1.0))
        date = (last_date.to_period("Q") + h).to_timestamp(how="start")
        rows.append({"date": date, "unrate": u[-1], "chargeoff": co})
    return pd.DataFrame(rows).set_index("date")


def last_state(panel: pd.DataFrame) -> tuple[pd.Timestamp, dict[str, float], list[tuple[pd.Timestamp, float]]]:
    """Latest quarter with charge-off and unemployment, plus the 5-quarter unemployment history."""
    obs = panel.dropna(subset=[TARGET, "unrate"])
    last_date = obs.index.max()
    hist = continuous_quarters(panel)["unrate"].loc[:last_date].iloc[-5:]
    if len(hist) < 5 or hist.iloc[[0, -1]].isna().any() or hist.isna().sum() > 1:
        raise ValueError("Need 5 consecutive quarters of unemployment ending at the last observation")
    hist = hist.interpolate()  # a single interior missing quarter is filled linearly
    row = panel.loc[last_date]
    last = {k: float(row[k]) for k in ("chargeoff", "delinquency", "unrate") if k in row and pd.notna(row[k])}
    return last_date, last, list(hist.items())


def _records(df: pd.DataFrame, cols: list[str]) -> list[dict[str, Any]]:
    out = df[cols].round(4).reset_index()
    out["date"] = out["date"].dt.strftime("%Y-%m-%d")
    return [{k: (None if pd.isna(v) else v) for k, v in r.items()} for r in out.to_dict("records")]


def stress_payload(
    panel: pd.DataFrame,
    model: FittedModel,
    shock_pp: float = 2.0,
    horizon: int = 8,
    ramp: int = 4,
    data_source: str = "live",
) -> dict[str, Any]:
    """Build the JSON payload the dashboard consumes (schema in docs/DATA_CONTRACT.md).

    data_source records whether the inputs came from the live FRED API or cached seed data, so
    monitoring can tell stale-but-published data from a healthy run.
    """
    last_date, last, hist = last_state(panel)
    u_hist = [u for _, u in hist]
    baseline = project(model, last["chargeoff"], u_hist, last_date, 0.0, horizon, ramp)
    shocked = project(model, last["chargeoff"], u_hist, last_date, shock_pp, horizon, ramp)
    history_cols = [c for c in ("chargeoff", "delinquency", "unrate") if c in panel]
    return {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "FRED",
        "data_source": data_source,
        "series": {k: SERIES[k] for k in ("chargeoff", "delinquency", "unrate")},
        "model": {
            "type": "OLS",
            "target": TARGET,
            "formula": "chargeoff_t = intercept + b1*chargeoff_{t-1} + b2*(unrate_{t-1} - unrate_{t-5})",
            "intercept": round(model.intercept, 6),
            "coefficients": {k: round(v, 6) for k, v in model.coefficients.items()},
            "r_squared": round(model.r_squared, 4),
            "n_obs": model.n_obs,
            "sample_start": model.sample_start.strftime("%Y-%m-%d"),
            "sample_end": model.sample_end.strftime("%Y-%m-%d"),
            "excluded": [{"start": lo, "end": hi, "reason": EXCLUSION_REASON} for lo, hi in model.excluded],
        },
        "last_observed": {"date": last_date.strftime("%Y-%m-%d"), **{k: round(v, 4) for k, v in last.items()}},
        "unrate_history": [{"date": d.strftime("%Y-%m-%d"), "unrate": round(float(u), 4)} for d, u in hist],
        "scenario_defaults": {"horizon_quarters": horizon, "ramp_quarters": ramp, "shock_pp": shock_pp},
        "history": _records(panel.loc[:last_date], history_cols),
        "scenarios": {
            "baseline": _records(baseline, ["unrate", "chargeoff"]),
            f"shock_{shock_pp:g}pp": _records(shocked, ["unrate", "chargeoff"]),
        },
    }
