import json
import os
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

FRED_API_KEY_VAR = "FRED_API_KEY"
SEED_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"

SERIES: dict[str, str] = {
    "delinquency": "DRCCLACBS",
    "chargeoff":   "CORCCACBS",
    "unrate":      "UNRATE",
    "fedfunds":    "FEDFUNDS",
    "cpi":         "CPIAUCSL",
}


def fetch_fred_observations(series_id: str, api_key: str) -> pd.Series:
    """Fetch one FRED series via the observations endpoint."""
    params = urllib.parse.urlencode({
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": "1985-01-01",
    })
    url = f"https://api.stlouisfed.org/fred/series/observations?{params}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read())
    obs = data["observations"]
    dates = pd.to_datetime([o["date"] for o in obs])
    values = [np.nan if o["value"] == "." else float(o["value"]) for o in obs]
    return pd.Series(values, index=dates, name=series_id)


def load_all_series(
    seed_dir: Path | None = None,
) -> tuple[dict[str, pd.Series], str]:
    """Fetch every series from FRED, falling back to seed CSVs.

    Returns ``(series_dict, source)`` where *source* is ``"FRED"`` or
    ``"seed"``.
    """
    api_key = os.environ.get(FRED_API_KEY_VAR, "")
    seed = seed_dir or SEED_DIR

    if api_key:
        try:
            raw: dict[str, pd.Series] = {}
            for name, sid in SERIES.items():
                raw[name] = fetch_fred_observations(sid, api_key)
            return raw, "FRED"
        except Exception:
            pass

    raw = {}
    for name, sid in SERIES.items():
        path = seed / f"{sid}.csv"
        if not path.exists():
            raise FileNotFoundError(f"Seed file not found: {path}")
        df = pd.read_csv(path, parse_dates=["date"], index_col="date").squeeze(
            "columns"
        )
        df = df.replace(".", np.nan).astype(float)
        df.name = sid
        raw[name] = df
    return raw, "seed"
