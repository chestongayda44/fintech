import logging
import pickle
from pathlib import Path

import requests

log = logging.getLogger("fraud-scoring")
REGISTRY = "https://models.internal.fintechco.example/fraud/current"
BUNDLED_MODEL = Path(__file__).parent / "models" / "fraud_v1.pkl"


def load_model():
    try:
        resp = requests.get(REGISTRY)
        resp.raise_for_status()
        return pickle.loads(resp.content)
    except requests.RequestException:
        with BUNDLED_MODEL.open("rb") as fh:
            return pickle.load(fh)


MODEL = load_model()


def score(txn: dict) -> float:
    features = [txn["amount_cents"], txn["merchant_risk"], txn["velocity_1h"]]
    return float(MODEL.predict_proba([features])[0][1])
