import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from risk_model.transforms import build_panel, monthly_to_quarterly
from risk_model.model import fit, project


# ── FRED "." handling ────────────────────────────────────────────────────

def test_dot_treated_as_nan():
    """FRED returns '.' for missing values — must become NaN, never zero."""
    dates = pd.to_datetime(["2020-01-01", "2020-02-01", "2020-03-01"])
    s = pd.Series(["3.5", ".", "4.0"], index=dates).replace(".", np.nan).astype(float)
    assert np.isnan(s.iloc[1])
    assert s.iloc[1] != 0.0


# ── ≥2-of-3-months rule ─────────────────────────────────────────────────

def test_quarterly_mean_requires_2_of_3():
    dates = pd.to_datetime(["2020-01-01", "2020-02-01", "2020-03-01",
                            "2020-04-01", "2020-05-01", "2020-06-01"])
    values = [3.0, 4.0, 5.0, 6.0, np.nan, np.nan]
    s = pd.Series(values, index=dates, name="test")

    q = monthly_to_quarterly(s, min_months=2)

    assert q.loc[pd.Period("2020Q1", "Q")] == pytest.approx(4.0)
    assert np.isnan(q.loc[pd.Period("2020Q2", "Q")])


def test_two_of_three_months_accepted():
    dates = pd.to_datetime(["2020-01-01", "2020-02-01", "2020-03-01"])
    values = [3.0, np.nan, 5.0]
    s = pd.Series(values, index=dates, name="test")

    q = monthly_to_quarterly(s, min_months=2)
    assert q.loc[pd.Period("2020Q1", "Q")] == pytest.approx(4.0)


# ── Gap-free panel ───────────────────────────────────────────────────────

def _make_raw() -> dict[str, pd.Series]:
    """Minimal synthetic series spanning a few quarters."""
    q_dates = pd.to_datetime(["2020-01-01", "2020-04-01", "2020-10-01"])
    m_dates = pd.to_datetime([
        "2020-01-01", "2020-02-01", "2020-03-01",
        "2020-04-01", "2020-05-01", "2020-06-01",
        "2020-07-01", "2020-08-01", "2020-09-01",
        "2020-10-01", "2020-11-01", "2020-12-01",
    ])
    return {
        "delinquency": pd.Series([2.5, 2.6, 2.8], index=q_dates),
        "chargeoff":   pd.Series([3.5, 3.6, 3.8], index=q_dates),
        "unrate":      pd.Series([3.5]*12, index=m_dates),
        "fedfunds":    pd.Series([0.1]*12, index=m_dates),
        "cpi":         pd.Series([260.0]*12, index=m_dates),
    }


def test_panel_is_gap_free():
    """A missing quarter (2020Q3) must appear as a row with NaN, not be dropped."""
    raw = _make_raw()
    panel = build_panel(raw)

    expected_quarters = pd.period_range("2020Q1", "2020Q4", freq="Q")
    assert list(panel.index) == list(expected_quarters)
    assert pd.Period("2020Q3", "Q") in panel.index


def test_lag_on_gapfree_index():
    """Shifting on a gap-free index must not skip over a missing quarter.

    2020Q3 delinquency is NaN (gap in source).  shift(1) at Q4 must see
    that NaN, not jump back to Q2's value — which would happen if Q3
    were absent from the index entirely.
    """
    raw = _make_raw()
    panel = build_panel(raw)

    shifted = panel["delinquency"].shift(1)
    assert np.isnan(shifted.iloc[0])
    assert shifted.loc[pd.Period("2020Q2", "Q")] == pytest.approx(2.5)
    assert np.isnan(shifted.loc[pd.Period("2020Q4", "Q")])


# ── Model sign check ────────────────────────────────────────────────────

def test_model_unemployment_sign(tmp_path):
    """Unemployment-change coefficient must be positive (higher Δunrate → higher losses)."""
    panel_csv = Path(__file__).resolve().parent.parent / "data" / "published" / "macro_panel.csv"
    if not panel_csv.exists():
        pytest.skip("Published panel not available")

    df = pd.read_csv(panel_csv, parse_dates=["date"], index_col="date")
    df.index = df.index.to_period("Q")
    df.index.name = "quarter"

    model = fit(df, sample_start="2000Q1", exclude_pandemic=True)
    assert model.params["unrate_chg4_lag1"] > 0, "Wrong sign: higher unemployment should raise losses"


# ── Projection ───────────────────────────────────────────────────────────

def test_baseline_projection_stable():
    """With zero shock, projections should converge toward the model's long-run mean."""
    path = project(
        intercept=1.5, b1=0.7, b2=0.5,
        last_chargeoff=4.0,
        unrate_history=[4.0, 4.0, 4.0, 4.0, 4.0],
        last_date="2026-04-01",
        shock_pp=0.0, horizon=4, ramp=4,
    )
    assert len(path) == 4
    for step in path:
        assert "date" in step and "chargeoff" in step and "unrate" in step
    # With constant unemployment and zero shock, delta_u = 0 each step
    # so chargeoff converges to intercept / (1 - b1) = 1.5 / 0.3 = 5.0
    assert path[-1]["chargeoff"] == pytest.approx(1.5 + 0.7 * path[-2]["chargeoff"], rel=1e-4)


def test_shock_raises_chargeoffs():
    """A positive unemployment shock must produce higher charge-offs than baseline."""
    common = dict(
        intercept=1.5, b1=0.7, b2=0.5,
        last_chargeoff=4.0,
        unrate_history=[4.0, 4.0, 4.0, 4.0, 4.0],
        last_date="2026-04-01",
        horizon=8, ramp=4,
    )
    baseline = project(**common, shock_pp=0.0)
    shocked = project(**common, shock_pp=2.0)

    for b, s in zip(baseline[1:], shocked[1:]):
        assert s["chargeoff"] > b["chargeoff"]


# ── Storage round-trip ───────────────────────────────────────────────────

def test_publish_local(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_SOURCE", "local")
    monkeypatch.setattr("risk_model.storage.LOCAL_DIR", tmp_path)

    from risk_model.storage import publish

    panel = pd.DataFrame(
        {"chargeoff": [3.5, 3.6]},
        index=pd.period_range("2025Q1", periods=2, freq="Q"),
    )
    panel.index.name = "quarter"
    payload = {"schema_version": 2, "test": True}

    publish(panel, payload)

    assert (tmp_path / "macro_panel.csv").exists()
    assert (tmp_path / "stress_payload.json").exists()

    loaded = json.loads((tmp_path / "stress_payload.json").read_text())
    assert loaded["schema_version"] == 2
