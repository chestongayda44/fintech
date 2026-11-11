"""Frequency alignment and feature construction."""
from __future__ import annotations

import pandas as pd

QUARTERLY_NATIVE = {"delinquency", "chargeoff"}
MIN_MONTHS_PER_QUARTER = 2


def to_quarterly(series: pd.Series, name: str) -> pd.Series:
    """Quarterly series keyed by quarter-start date.

    Monthly data is averaged over the months available, provided at least 2 of 3 are present
    (FRED occasionally has a missing month, e.g. a skipped release, encoded as ".").
    """
    s = series.dropna()
    if name in QUARTERLY_NATIVE:
        q = s.groupby(s.index.to_period("Q")).last()
    else:
        grouped = s.groupby(s.index.to_period("Q"))
        q = grouped.mean()[grouped.count() >= MIN_MONTHS_PER_QUARTER]
    q.index = q.index.to_timestamp(how="start")
    q.index.name = "date"
    return q.rename(name)


def continuous_quarters(df: pd.DataFrame) -> pd.DataFrame:
    """Reindex to an unbroken quarterly sequence so shifts never jump across a gap."""
    if df.empty:
        return df
    full = pd.period_range(df.index.min().to_period("Q"), df.index.max().to_period("Q"), freq="Q")
    out = df.reindex(full.to_timestamp(how="start"))
    out.index.name = "date"
    return out


def build_quarterly_panel(data: dict[str, pd.Series]) -> pd.DataFrame:
    """Join all series on a gap-free quarterly index; derive CPI year-over-year inflation.

    Leading/trailing quarters without the core series are trimmed; interior quarters with
    missing values are kept as NaN rows so the time axis stays continuous.
    """
    cols = {name: to_quarterly(s, name) for name, s in data.items()}
    panel = continuous_quarters(pd.concat(cols.values(), axis=1, sort=True))
    if "cpi" in panel:
        panel["cpi_yoy"] = panel["cpi"].pct_change(4, fill_method=None) * 100
        panel = panel.drop(columns="cpi")
    core = [c for c in ("chargeoff", "unrate") if c in panel]
    complete = panel[core].notna().all(axis=1)
    if complete.any():
        panel = panel.loc[complete[complete].index.min(): complete[complete].index.max()]
    return panel


def add_features(panel: pd.DataFrame) -> pd.DataFrame:
    """Model features, computed on a continuous quarterly index."""
    out = continuous_quarters(panel)
    out["chargeoff_lag1"] = out["chargeoff"].shift(1)
    out["unrate_chg4"] = out["unrate"] - out["unrate"].shift(4)
    out["unrate_chg4_lag1"] = out["unrate_chg4"].shift(1)
    return out
