"""Synthetic FRED-shaped data for offline tests. NOT real economic data.

Charge-offs are generated from a known relationship so tests can check the model recovers it.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

TRUE = {"intercept": 1.3, "chargeoff_lag1": 0.7, "unrate_chg4_lag1": 0.5}


def _synthetic(seed: int = 7) -> dict[str, pd.Series]:
    rng = np.random.default_rng(seed)
    months = pd.date_range("1990-01-01", "2026-06-01", freq="MS")
    t = np.arange(len(months))
    unrate = 5.5 + 1.8 * np.sin(t / 30) + rng.normal(0, 0.1, len(t))
    fedfunds = np.clip(3 + 2.5 * np.cos(t / 55) + rng.normal(0, 0.1, len(t)), 0.05, None)
    cpi = 150 * np.exp(0.0022 * t + rng.normal(0, 0.001, len(t)))
    monthly = pd.DataFrame({"unrate": unrate, "fedfunds": fedfunds, "cpi": cpi}, index=months)

    q = monthly.groupby(monthly.index.to_period("Q")).mean()
    q.index = q.index.to_timestamp(how="start")
    chg4 = q["unrate"] - q["unrate"].shift(4)
    co = [4.3] * 5
    for i in range(5, len(q)):
        co.append(TRUE["intercept"] + TRUE["chargeoff_lag1"] * co[-1]
                  + TRUE["unrate_chg4_lag1"] * chg4.iloc[i - 1] + rng.normal(0, 0.05))
    chargeoff = pd.Series(co, index=q.index)
    return {
        "delinquency": chargeoff * 0.8,
        "chargeoff": chargeoff,
        "unrate": monthly["unrate"],
        "fedfunds": monthly["fedfunds"],
        "cpi": monthly["cpi"],
    }


@pytest.fixture(scope="session")
def synthetic_data() -> dict[str, pd.Series]:
    return _synthetic()


@pytest.fixture()
def seed_dir(tmp_path: Path, synthetic_data) -> Path:
    """Write synthetic data as FRED-style seed CSVs, including a '.' missing value."""
    from risk_model.fred_client import SERIES

    for name, sid in SERIES.items():
        s = synthetic_data[name]
        with (tmp_path / f"{sid}.csv").open("w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["date", "value"])
            for i, (d, v) in enumerate(s.items()):
                w.writerow([d.strftime("%Y-%m-%d"), "." if (name == "unrate" and i == 5) else f"{v:.4f}"])
    return tmp_path
