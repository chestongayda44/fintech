import json
import os
from pathlib import Path

import pandas as pd

LOCAL_DIR = Path(__file__).resolve().parent.parent / "data" / "published"


def publish(panel: pd.DataFrame, payload: dict) -> str:
    """Write macro_panel.csv and stress_payload.json.

    Destination is controlled by ``DATA_SOURCE`` env var
    (``"gcs"`` or ``"local"``; default ``"local"``).
    Returns the destination description.
    """
    source = os.environ.get("DATA_SOURCE", "local")

    pdf = panel.copy()
    if hasattr(pdf.index, "to_timestamp"):
        pdf.index = pdf.index.to_timestamp()
    pdf.index.name = "date"

    if source == "gcs":
        return _publish_gcs(pdf, payload)
    return _publish_local(pdf, payload)


def _publish_local(pdf: pd.DataFrame, payload: dict) -> str:
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    pdf.to_csv(LOCAL_DIR / "macro_panel.csv")
    with open(LOCAL_DIR / "stress_payload.json", "w") as f:
        json.dump(payload, f, indent=2)
        f.write("\n")
    return str(LOCAL_DIR)


def _publish_gcs(pdf: pd.DataFrame, payload: dict) -> str:
    from google.cloud import storage as gcs_storage

    bucket_name = os.environ["GCS_BUCKET"]
    prefix = os.environ.get("GCS_PREFIX", "").strip("/")
    client = gcs_storage.Client()
    bucket = client.bucket(bucket_name)

    def blob_path(name: str) -> str:
        return f"{prefix}/{name}" if prefix else name

    blob = bucket.blob(blob_path("macro_panel.csv"))
    blob.upload_from_string(pdf.to_csv(), content_type="text/csv")

    blob = bucket.blob(blob_path("stress_payload.json"))
    blob.upload_from_string(
        json.dumps(payload, indent=2) + "\n", content_type="application/json"
    )
    return f"gs://{bucket_name}/{prefix}"
