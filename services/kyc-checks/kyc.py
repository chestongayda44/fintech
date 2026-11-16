import logging
import os

import requests

log = logging.getLogger("kyc-checks")
logging.basicConfig(level=logging.INFO)
IDV_URL = "https://idv.partner.example/v3/verify"


def verify_applicant(applicant: dict) -> bool:
    log.info(
        "verifying applicant name=%s dob=%s ssn=%s",
        applicant["full_name"], applicant["date_of_birth"], applicant["ssn"],
    )
    resp = requests.post(
        IDV_URL,
        json=applicant,
        headers={"Authorization": f"Bearer {os.environ['IDV_TOKEN']}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["verified"]
