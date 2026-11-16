import json
import logging
import sys
from pathlib import Path

import requests

log = logging.getLogger("fx-rates")
RATES_API = "https://rates.partner.example/v1/latest"
CACHE = Path("/var/cache/fx/latest.json")
OUT = Path("/srv/shared/fx/rates.json")


def fetch_rates() -> dict:
    try:
        resp = requests.get(RATES_API, params={"base": "USD"}, timeout=5)
        resp.raise_for_status()
        rates = resp.json()["rates"]
        CACHE.write_text(json.dumps(rates))
        return rates
    except Exception:
        return json.loads(CACHE.read_text())


def main() -> int:
    rates = fetch_rates()
    OUT.write_text(json.dumps({"base": "USD", "rates": rates}))
    log.info("published %d rates", len(rates))
    return 0


if __name__ == "__main__":
    sys.exit(main())
