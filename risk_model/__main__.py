"""End-to-end pipeline: python -m risk_model [--shock 2.0] [--offline]"""
from __future__ import annotations

import argparse
import logging
import time

from risk_model import storage
from risk_model.fred_client import load_all
from risk_model.model import fit, sanity_check, stress_payload
from risk_model.transforms import build_quarterly_panel


def main() -> None:
    p = argparse.ArgumentParser(description="Build and publish the macro stress artifacts")
    p.add_argument("--shock", type=float, default=2.0, help="unemployment shock in percentage points")
    p.add_argument("--offline", action="store_true", help="use data/seed instead of the FRED API")
    p.add_argument("--fit-start", default="1991-01-01", help="first quarter used to fit the model")
    args = p.parse_args()
    logging.Formatter.converter = time.gmtime  # job logs are in UTC, like the rest of ops/logs
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")

    data, source = load_all(prefer_live=not args.offline)
    panel = build_quarterly_panel(data)
    model = fit(panel, start=args.fit_start)
    payload = stress_payload(panel, model, shock_pp=args.shock)
    where = storage.publish(panel, payload)

    base = [r["chargeoff"] for r in payload["scenarios"]["baseline"]]
    shocked = [r["chargeoff"] for r in list(payload["scenarios"].values())[1]]
    gap = max(s - b for s, b in zip(shocked, base))
    logging.info("data source: %s | quarters: %d | fit n=%d R^2=%.3f", source, len(panel), model.n_obs, model.r_squared)
    logging.info("unemployment effect (1y change): %+.3f (t=%.1f) | persistence %.3f",
                 model.coefficients["unrate_chg4_lag1"], model.tvalues["unrate_chg4_lag1"],
                 model.coefficients["chargeoff_lag1"])
    for problem in sanity_check(model):
        logging.warning("SANITY CHECK FAILED: %s", problem)
    logging.info("charge-offs, peak over 8q: baseline %.2f%% vs +%gpp shock %.2f%% (max gap %+.2fpp)",
                 max(base), args.shock, max(shocked), gap)
    for name, loc in where.items():
        logging.info("published %s -> %s", name, loc)


if __name__ == "__main__":
    main()
