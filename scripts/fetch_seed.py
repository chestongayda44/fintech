#!/usr/bin/env python3
"""Download the demo's FRED series once and cache them in data/seed/.

Run before rehearsals (and commit the CSVs) so the demo still works when the
FRED API or venue network is unavailable:

    FRED_API_KEY=... python scripts/fetch_seed.py

Deliberately standalone (only needs `requests`) because it must work at the
`s1-start` checkpoint, before the `risk_model` package exists.
"""
from __future__ import annotations

import csv
import os
import sys
from pathlib import Path

import requests

SERIES = {
    "UNRATE": "Unemployment rate (monthly, SA)",
    "DRCCLACBS": "Delinquency rate on credit card loans, all commercial banks (quarterly, SA)",
    "CORCCACBS": "Charge-off rate on credit card loans, all commercial banks (quarterly, SA)",
    "FEDFUNDS": "Effective federal funds rate (monthly)",
    "CPIAUCSL": "CPI, all urban consumers (monthly, SA)",
}
START = "1990-01-01"
URL = "https://api.stlouisfed.org/fred/series/observations"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "seed"


def main() -> int:
    api_key = os.environ.get("FRED_API_KEY")
    if not api_key:
        print("Set FRED_API_KEY first.", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for series_id, label in SERIES.items():
        resp = requests.get(
            URL,
            params={
                "series_id": series_id,
                "api_key": api_key,
                "file_type": "json",
                "observation_start": START,
            },
            timeout=30,
        )
        resp.raise_for_status()
        rows = resp.json()["observations"]
        path = OUT_DIR / f"{series_id}.csv"
        with path.open("w", newline="") as fh:
            writer = csv.writer(fh)
            writer.writerow(["date", "value"])
            for row in rows:
                writer.writerow([row["date"], row["value"]])  # keep "." as-is; parser handles it
        print(f"{series_id:10s} {len(rows):5d} obs  -> {path.relative_to(OUT_DIR.parent.parent)}  ({label})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
