"""FRED API client with an offline fallback to cached seed data."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests

log = logging.getLogger(__name__)

FRED_URL = "https://api.stlouisfed.org/fred/series/observations"
# Cached FRED data used when the live API is unavailable. Override with RISK_MODEL_SEED_DIR.
SEED_DIR = Path(os.environ.get("RISK_MODEL_SEED_DIR") or Path(__file__).resolve().parent.parent / "data" / "seed")

# Column name in the panel -> FRED series id
SERIES: dict[str, str] = {
    "delinquency": "DRCCLACBS",  # quarterly, SA
    "chargeoff": "CORCCACBS",  # quarterly, SA
    "unrate": "UNRATE",  # monthly, SA
    "fedfunds": "FEDFUNDS",  # monthly
    "cpi": "CPIAUCSL",  # monthly, SA
}


class FredError(RuntimeError):
    pass


def parse_observations(rows: Iterable[dict]) -> pd.Series:
    """Turn FRED observation dicts into a float Series indexed by date.

    FRED encodes missing values as "." — these become NaN, never zero.
    """
    records = [(r["date"], r["value"]) for r in rows]
    if not records:
        return pd.Series(dtype="float64")
    dates, values = zip(*records)
    s = pd.Series(
        pd.to_numeric(pd.Series(values).replace(".", pd.NA), errors="coerce").astype("float64").values,
        index=pd.to_datetime(list(dates)),
    )
    s.index.name = "date"
    return s.sort_index()


def fetch_series(series_id: str, start: str = "1990-01-01", timeout: float = 20.0) -> pd.Series:
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        raise FredError("FRED_API_KEY is not set")
    try:
        resp = requests.get(
            FRED_URL,
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "observation_start": start,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        # Never include the request URL: it contains the API key.
        raise FredError(f"FRED request for {series_id} failed: {type(exc).__name__}") from None
    return parse_observations(resp.json()["observations"])


SEARCH_URL = "https://api.stlouisfed.org/fred/series/search"
SEARCH_COLUMNS = ["id", "title", "frequency_short", "seasonal_adjustment_short", "units", "observation_end", "popularity"]


def search_series(query: str, limit: int = 10, timeout: float = 20.0) -> pd.DataFrame:
    """Search the FRED catalog. Returns candidate series ranked by popularity."""
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        raise FredError("FRED_API_KEY is not set")
    try:
        resp = requests.get(
            SEARCH_URL,
            params={
                "search_text": query,
                "api_key": api_key,
                "file_type": "json",
                "order_by": "popularity",
                "sort_order": "desc",
                "limit": limit,
            },
            timeout=timeout,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise FredError(f"FRED search for {query!r} failed: {type(exc).__name__}") from None
    df = pd.DataFrame(resp.json().get("seriess", []))
    return df.reindex(columns=SEARCH_COLUMNS)


def load_seed(series_id: str, seed_dir: Path = SEED_DIR) -> pd.Series:
    path = seed_dir / f"{series_id}.csv"
    if not path.exists():
        raise FredError(f"No seed file for {series_id} at {path}")
    df = pd.read_csv(path, dtype={"value": str})
    return parse_observations(df.to_dict("records"))


def fallback_allowed() -> bool:
    """Seed fallback is opt-in (ALLOW_SEED_FALLBACK=1): fine in notebooks and dev, never in production jobs."""
    return os.environ.get("ALLOW_SEED_FALLBACK", "").strip().lower() in {"1", "true", "yes"}


def load_all(
    start: str = "1990-01-01",
    prefer_live: bool = True,
    seed_dir: Path = SEED_DIR,
    allow_fallback: bool | None = None,
) -> tuple[dict[str, pd.Series], str]:
    """Load every series in SERIES. Returns (data, source) where source is 'live' or 'seed'.

    If the live API fails, falling back to cached seed data is only allowed when explicitly enabled
    (allow_fallback, or ALLOW_SEED_FALLBACK=1). Otherwise this raises: a production job must fail
    loudly rather than publish old data that looks current.
    """
    if prefer_live:
        try:
            data = {name: fetch_series(sid, start) for name, sid in SERIES.items()}
            return data, "live"
        except FredError as exc:
            if not (fallback_allowed() if allow_fallback is None else allow_fallback):
                raise FredError(
                    f"Live FRED unavailable ({exc}) and seed fallback is disabled. Refusing to publish "
                    "cached data; set ALLOW_SEED_FALLBACK=1 only for notebooks and dev."
                ) from None
            log.warning("Live FRED unavailable (%s); falling back to seed data", exc)
    data = {name: load_seed(sid, seed_dir) for name, sid in SERIES.items()}
    data = {name: s[s.index >= pd.Timestamp(start)] for name, s in data.items()}
    return data, "seed"
