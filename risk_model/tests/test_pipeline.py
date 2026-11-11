import json
import math
from pathlib import Path

import pandas as pd
import pytest

from risk_model import storage
from risk_model.fred_client import FredError, load_all, parse_observations
from risk_model.model import FEATURES, PANDEMIC, fit, last_state, project, sanity_check, stress_payload
from risk_model.transforms import add_features, build_quarterly_panel, continuous_quarters, to_quarterly

from .conftest import TRUE

REAL_PANEL = Path(__file__).parent / "fixtures" / "fred_panel_2026q2.csv"


def real_panel() -> pd.DataFrame:
    """Real FRED data through 2026Q2 (public). Note: 2025Q4 is absent, as produced by the
    original pipeline, which is exactly the kind of gap the model must handle."""
    return pd.read_csv(REAL_PANEL, parse_dates=["date"]).set_index("date")


# --- fred_client -----------------------------------------------------------

def test_parse_treats_dot_as_missing_not_zero():
    s = parse_observations([
        {"date": "2020-01-01", "value": "3.5"},
        {"date": "2020-02-01", "value": "."},
        {"date": "2020-03-01", "value": "4.4"},
    ])
    assert s.dtype == "float64"
    assert math.isnan(s.iloc[1])
    assert s.iloc[2] == 4.4


def test_parse_empty():
    assert parse_observations([]).empty


def test_fetch_without_key_falls_back_to_seed(monkeypatch, seed_dir):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    data, source = load_all(seed_dir=seed_dir)
    assert source == "seed"
    assert set(data) == {"delinquency", "chargeoff", "unrate", "fedfunds", "cpi"}


def test_search_series_parses_and_never_leaks_key(monkeypatch):
    from risk_model import fred_client

    seen = {}

    class Resp:
        def raise_for_status(self):
            pass

        def json(self):
            return {"seriess": [
                {"id": "CORCCACBS", "title": "Charge-Off Rate on Credit Card Loans", "frequency_short": "Q",
                 "seasonal_adjustment_short": "SA", "units": "Percent", "observation_end": "2026-04-01",
                 "popularity": 55, "notes": "ignored"},
            ]}

    def fake_get(url, params, timeout):
        seen.update(params)
        return Resp()

    monkeypatch.setenv("FRED_API_KEY", "k" * 32)
    monkeypatch.setattr(fred_client.requests, "get", fake_get)
    df = fred_client.search_series("credit card charge-off")
    assert list(df.columns) == fred_client.SEARCH_COLUMNS
    assert df.loc[0, "id"] == "CORCCACBS"
    assert seen["order_by"] == "popularity"

    def failing_get(url, params, timeout):
        raise fred_client.requests.ConnectionError(f"boom {url}?api_key={params['api_key']}")

    monkeypatch.setattr(fred_client.requests, "get", failing_get)
    with pytest.raises(FredError) as err:
        fred_client.search_series("x")
    assert "k" * 32 not in str(err.value)


def test_missing_seed_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    with pytest.raises(FredError):
        load_all(seed_dir=tmp_path)


# --- transforms ------------------------------------------------------------

def test_monthly_to_quarterly_needs_two_of_three_months():
    s = pd.Series([1.0, float("nan"), 3.0, 10.0], index=pd.to_datetime(
        ["2020-01-01", "2020-02-01", "2020-03-01", "2020-04-01"]))
    q = to_quarterly(s, "unrate")
    assert list(q.index) == [pd.Timestamp("2020-01-01")]  # Q1 kept (2 months), Q2 dropped (1 month)
    assert q.iloc[0] == 2.0


def test_continuous_quarters_fills_gaps():
    idx = pd.to_datetime(["2025-07-01", "2026-01-01"])
    out = continuous_quarters(pd.DataFrame({"x": [1.0, 2.0]}, index=idx))
    assert list(out.index) == list(pd.to_datetime(["2025-07-01", "2025-10-01", "2026-01-01"]))
    assert math.isnan(out.loc["2025-10-01", "x"])


def test_lags_never_jump_across_a_gap():
    feats = add_features(real_panel())
    # 2025Q4 is missing in the fixture, so 2026Q1's lag must be NaN, not 2025Q3's value
    assert math.isnan(feats.loc["2026-01-01", "chargeoff_lag1"])
    assert feats.loc["2026-04-01", "chargeoff_lag1"] == feats.loc["2026-01-01", "chargeoff"]


def test_panel_is_quarterly_continuous_and_trimmed(synthetic_data):
    panel = build_quarterly_panel(synthetic_data)
    assert panel.index.is_monotonic_increasing
    assert (panel.index.month.isin([1, 4, 7, 10])).all()
    assert len(panel) == len(continuous_quarters(panel))
    assert panel[["chargeoff", "unrate"]].iloc[[0, -1]].notna().all().all()
    assert "cpi_yoy" in panel and "cpi" not in panel


# --- model: synthetic ------------------------------------------------------

def test_fit_recovers_known_coefficients(synthetic_data):
    m = fit(build_quarterly_panel(synthetic_data), exclude=[])
    for k in FEATURES:
        assert m.coefficients[k] == pytest.approx(TRUE[k], abs=0.08)
    assert sanity_check(m) == []


def test_fit_requires_enough_data(synthetic_data):
    panel = build_quarterly_panel(synthetic_data).iloc[:10]
    with pytest.raises(ValueError):
        fit(panel)


def test_projection_mechanics(synthetic_data):
    panel = build_quarterly_panel(synthetic_data)
    m = fit(panel)
    last_date, last, hist = last_state(panel)
    u = [x for _, x in hist]
    base = project(m, last["chargeoff"], u, last_date, 0.0)
    shocked = project(m, last["chargeoff"], u, last_date, 2.0)
    assert len(base) == 8
    assert shocked["unrate"].iloc[1] == pytest.approx(last["unrate"] + 1.0)  # ramp: 2/4 of shock
    assert shocked["unrate"].iloc[-1] == pytest.approx(last["unrate"] + 2.0)
    assert shocked["chargeoff"].iloc[0] == pytest.approx(base["chargeoff"].iloc[0])  # 1-quarter lag
    assert (shocked["chargeoff"].iloc[1:] > base["chargeoff"].iloc[1:]).all()
    assert base.index[0] == (last_date.to_period("Q") + 1).to_timestamp()


def test_last_state_history_is_consecutive_quarters():
    last_date, _, hist = last_state(real_panel())
    dates = [d for d, _ in hist]
    assert dates == list(pd.period_range(end=last_date.to_period("Q"), periods=5, freq="Q").to_timestamp())
    values = dict(hist)
    expected = (values[pd.Timestamp("2025-07-01")] + values[pd.Timestamp("2026-01-01")]) / 2
    assert values[pd.Timestamp("2025-10-01")] == pytest.approx(expected)  # missing 2025Q4 interpolated


def test_project_requires_five_quarters_of_history(synthetic_data):
    m = fit(build_quarterly_panel(synthetic_data))
    with pytest.raises(ValueError):
        project(m, 4.0, [4.0, 4.1, 4.2], pd.Timestamp("2026-04-01"))


# --- model: real FRED data (the checks a data science lead would make) -----

def test_real_data_naive_levels_model_gets_the_sign_wrong():
    """Documents why the model uses charge-offs and the 1y unemployment change."""
    import statsmodels.api as sm
    p = continuous_quarters(real_panel())
    df = pd.DataFrame({"y": p["delinquency"], "y1": p["delinquency"].shift(1),
                       "u1": p["unrate"].shift(1), "f1": p["fedfunds"].shift(1)})
    df = df[df.index >= "2000-01-01"].dropna()
    res = sm.OLS(df["y"], sm.add_constant(df[["y1", "u1", "f1"]])).fit()
    assert res.params["u1"] < 0


def test_real_data_model_is_economically_sane():
    m = fit(real_panel())
    assert sanity_check(m) == []
    assert m.coefficients["unrate_chg4_lag1"] > 0.3
    assert m.tvalues["unrate_chg4_lag1"] > 3
    assert 3 < m.long_run_mean < 7


def test_real_data_pandemic_exclusion_matters():
    with_covid = fit(real_panel(), exclude=[])
    without = fit(real_panel())
    assert without.coefficients["unrate_chg4_lag1"] > 3 * with_covid.coefficients["unrate_chg4_lag1"]
    assert without.excluded == [PANDEMIC]


def test_real_data_stress_response_is_plausible():
    panel = real_panel()
    p = stress_payload(panel, fit(panel))
    base = [r["chargeoff"] for r in p["scenarios"]["baseline"]]
    shock = [r["chargeoff"] for r in p["scenarios"]["shock_2pp"]]
    gap = max(s - b for s, b in zip(shock, base))
    assert 1.0 < gap < 3.5  # +2pp unemployment -> roughly +1-3.5pp charge-offs at peak


# --- payload / contract ----------------------------------------------------

def test_payload_matches_contract(synthetic_data):
    panel = build_quarterly_panel(synthetic_data)
    p = stress_payload(panel, fit(panel))
    assert p["schema_version"] == 2
    assert p["model"]["target"] == "chargeoff"
    assert set(p["model"]["coefficients"]) == set(FEATURES)
    assert set(p["scenarios"]) == {"baseline", "shock_2pp"}
    assert len(p["unrate_history"]) == 5
    assert p["unrate_history"][-1]["date"] == p["last_observed"]["date"]
    assert len(p["scenarios"]["baseline"]) == p["scenario_defaults"]["horizon_quarters"]
    json.dumps(p, allow_nan=False)


def test_contract_projection_rule_reproducible_from_payload():
    """The dashboard recomputes projections from the payload alone; prove that works on real data."""
    panel = real_panel()
    p = stress_payload(panel, fit(panel))
    b, last, d = p["model"]["coefficients"], p["last_observed"], p["scenario_defaults"]
    u = [r["unrate"] for r in p["unrate_history"]]
    co = last["chargeoff"]
    for h, row in enumerate(p["scenarios"]["shock_2pp"], start=1):
        co = p["model"]["intercept"] + b["chargeoff_lag1"] * co + b["unrate_chg4_lag1"] * (u[-1] - u[-5])
        u.append(last["unrate"] + d["shock_pp"] * min(h / d["ramp_quarters"], 1))
        assert row["chargeoff"] == pytest.approx(co, abs=1e-3)
        assert row["unrate"] == pytest.approx(u[-1], abs=1e-3)


# --- storage ---------------------------------------------------------------

def test_publish_and_read_local(tmp_path, monkeypatch, synthetic_data):
    monkeypatch.setenv("DATA_SOURCE", "local")
    monkeypatch.setattr(storage, "LOCAL_DIR", tmp_path)
    panel = build_quarterly_panel(synthetic_data)
    payload = stress_payload(panel, fit(panel))
    where = storage.publish(panel, payload)
    assert set(where) == {"macro_panel.csv", "stress_payload.json"}
    assert storage.read_payload()["schema_version"] == 2
    assert len(storage.read_panel()) == len(panel)
