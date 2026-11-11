from datetime import datetime, timezone

import numpy as np
import pandas as pd
import statsmodels.api as sm

PANDEMIC_START = "2020Q2"
PANDEMIC_END = "2021Q4"


def fit(
    panel: pd.DataFrame,
    sample_start: str = "2000Q1",
    exclude_pandemic: bool = True,
) -> sm.regression.linear_model.RegressionResultsWrapper:
    """Fit the charge-off stress model (OLS, HAC standard errors).

    Model: chargeoff_t = c + b1·chargeoff_{t-1} + b2·Δunrate_4q_{t-1}
    """
    df = panel[["chargeoff", "unrate"]].copy()
    df = df.loc[sample_start:]
    df["chargeoff_lag1"] = df["chargeoff"].shift(1)
    df["unrate_chg4_lag1"] = (df["unrate"] - df["unrate"].shift(4)).shift(1)
    df = df.dropna()

    if exclude_pandemic:
        mask = (df.index >= PANDEMIC_START) & (df.index <= PANDEMIC_END)
        df = df[~mask]

    y = df["chargeoff"]
    X = sm.add_constant(df[["chargeoff_lag1", "unrate_chg4_lag1"]])
    return sm.OLS(y, X).fit(cov_type="HAC", cov_kwds={"maxlags": 4})


def project(
    intercept: float,
    b1: float,
    b2: float,
    last_chargeoff: float,
    unrate_history: list[float],
    last_date: str,
    shock_pp: float = 0.0,
    horizon: int = 8,
    ramp: int = 4,
) -> list[dict]:
    """Project charge-offs forward under a unemployment shock scenario.

    *unrate_history* must hold the last 5 observed quarterly unemployment
    values (oldest first), ending at *last_date*.
    """
    last_unrate = unrate_history[-1]
    ur_path = list(unrate_history)
    co_path = [last_chargeoff]

    proj_start = pd.Period(last_date, freq="Q") + 1
    dates = pd.period_range(proj_start, periods=horizon, freq="Q")

    for h in range(1, horizon + 1):
        u_h = last_unrate + shock_pp * min(h / ramp, 1.0)
        ur_path.append(u_h)
        delta_u = ur_path[-2] - ur_path[-6]
        co_h = intercept + b1 * co_path[-1] + b2 * delta_u
        co_path.append(co_h)

    return [
        {
            "date": str(dates[i].to_timestamp().date()),
            "unrate": round(ur_path[len(unrate_history) + i], 4),
            "chargeoff": round(co_path[i + 1], 4),
        }
        for i in range(horizon)
    ]


def build_stress_payload(
    panel: pd.DataFrame,
    model_result: sm.regression.linear_model.RegressionResultsWrapper,
    source: str,
) -> dict:
    """Build the ``stress_payload.json`` dict per DATA_CONTRACT.md."""
    intercept = model_result.params["const"]
    b1 = model_result.params["chargeoff_lag1"]
    b2 = model_result.params["unrate_chg4_lag1"]

    # Last row with both chargeoff and unrate
    valid = panel[["chargeoff", "delinquency", "unrate"]].dropna()
    last = valid.iloc[-1]
    last_date = str(valid.index[-1].to_timestamp().date())

    # Last 5 quarters of unrate ending at last_date
    unrate_valid = panel["unrate"].dropna()
    ur_tail = unrate_valid.loc[:valid.index[-1]].iloc[-5:]
    unrate_hist = [
        {"date": str(p.to_timestamp().date()), "unrate": round(float(v), 4)}
        for p, v in ur_tail.items()
    ]

    # Sample bounds
    sample = panel.loc["2000Q1":][["chargeoff", "unrate"]].dropna()
    pandemic = (sample.index >= PANDEMIC_START) & (sample.index <= PANDEMIC_END)
    sample_clean = sample[~pandemic]

    # History for dashboard
    cols = ["chargeoff", "delinquency", "unrate"]
    hist_df = panel[cols].dropna(how="all")
    history = []
    for p, row in hist_df.iterrows():
        entry: dict = {"date": str(p.to_timestamp().date())}
        for c in cols:
            entry[c] = round(float(row[c]), 4) if pd.notna(row[c]) else None
        history.append(entry)

    # Projections
    ur_vals = [e["unrate"] for e in unrate_hist]
    baseline = project(intercept, b1, b2, float(last["chargeoff"]), ur_vals, last_date, shock_pp=0.0)
    shock = project(intercept, b1, b2, float(last["chargeoff"]), ur_vals, last_date, shock_pp=2.0)

    return {
        "schema_version": 2,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "series": {
            "chargeoff": "CORCCACBS",
            "delinquency": "DRCCLACBS",
            "unrate": "UNRATE",
        },
        "model": {
            "type": "OLS",
            "target": "chargeoff",
            "formula": "chargeoff_t = intercept + b1*chargeoff_{t-1} + b2*(unrate_{t-1} - unrate_{t-5})",
            "intercept": round(intercept, 6),
            "coefficients": {
                "chargeoff_lag1": round(b1, 6),
                "unrate_chg4_lag1": round(b2, 6),
            },
            "r_squared": round(model_result.rsquared, 4),
            "n_obs": int(model_result.nobs),
            "sample_start": str(sample_clean.index[0].to_timestamp().date()),
            "sample_end": str(sample_clean.index[-1].to_timestamp().date()),
            "excluded": [
                {
                    "start": "2020-04-01",
                    "end": "2021-12-31",
                    "reason": "pandemic: stimulus and forbearance broke the usual unemployment-loss link",
                }
            ],
        },
        "last_observed": {
            "date": last_date,
            "chargeoff": round(float(last["chargeoff"]), 4),
            "delinquency": round(float(last["delinquency"]), 4),
            "unrate": round(float(last["unrate"]), 4),
        },
        "unrate_history": unrate_hist,
        "scenario_defaults": {
            "horizon_quarters": 8,
            "ramp_quarters": 4,
            "shock_pp": 2.0,
        },
        "history": history,
        "scenarios": {
            "baseline": baseline,
            "shock_2pp": shock,
        },
    }
