import numpy as np
import pandas as pd

MONTHLY_SERIES = {"unrate", "fedfunds", "cpi"}
QUARTERLY_SERIES = {"delinquency", "chargeoff"}


def monthly_to_quarterly(s: pd.Series, min_months: int = 2) -> pd.Series:
    """Aggregate a monthly series to quarterly means.

    Quarters with fewer than *min_months* valid observations become NaN.
    """
    q = s.copy()
    q.index = q.index.to_period("Q")
    grp = q.groupby(level=0)
    mean = grp.mean()
    mean[grp.count() < min_months] = np.nan
    return mean


def build_panel(raw: dict[str, pd.Series]) -> pd.DataFrame:
    """Assemble a gap-free quarterly panel from raw FRED series."""
    quarterly: dict[str, pd.Series] = {}

    for name in QUARTERLY_SERIES:
        if name not in raw:
            continue
        s = raw[name].copy()
        s.index = s.index.to_period("Q")
        quarterly[name] = s

    for name in MONTHLY_SERIES:
        if name not in raw:
            continue
        quarterly[name] = monthly_to_quarterly(raw[name])

    if "cpi" in quarterly:
        cpi_q = quarterly.pop("cpi")
        quarterly["cpi_yoy"] = cpi_q.pct_change(periods=4) * 100

    panel = pd.DataFrame(quarterly).sort_index()

    full_range = pd.period_range(panel.index.min(), panel.index.max(), freq="Q")
    panel = panel.reindex(full_range)
    panel.index.name = "quarter"
    return panel
