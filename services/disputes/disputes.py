import logging
import os

import requests

log = logging.getLogger("disputes")
NETWORK_URL = os.environ["NETWORK_DISPUTES_URL"]


class DisputeError(RuntimeError):
    pass


def open_dispute(case_id: str, last4: str, amount_cents: int, reason: str) -> str:
    try:
        resp = requests.post(
            f"{NETWORK_URL}/disputes",
            json={"case_id": case_id, "card_last4": last4, "amount_cents": amount_cents, "reason": reason},
            headers={"Authorization": f"Bearer {os.environ['NETWORK_TOKEN']}"},
            timeout=10,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        log.error("opening dispute %s failed: %s", case_id, exc)
        raise DisputeError(f"could not open dispute {case_id}") from exc
    return resp.json()["dispute_id"]
