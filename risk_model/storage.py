"""Publish/read shared artifacts. DATA_SOURCE=gcs uses Cloud Storage, otherwise local disk.

All cross-team data access goes through here so the demo can flip to local
storage in one env var if the network misbehaves.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import pandas as pd

LOCAL_DIR = Path(__file__).resolve().parent.parent / "data" / "published"
PANEL_NAME = "macro_panel.csv"
PAYLOAD_NAME = "stress_payload.json"


def _mode() -> str:
    return os.environ.get("DATA_SOURCE", "local").lower()


def _bucket():
    from google.cloud import storage  # imported lazily: not needed for local mode

    return storage.Client().bucket(os.environ["GCS_BUCKET"])


def _blob_name(name: str) -> str:
    return f"{os.environ.get('GCS_PREFIX', 'macro-credit-risk').strip('/')}/{name}"


def _write(name: str, data: bytes, content_type: str) -> str:
    if _mode() == "gcs":
        blob = _bucket().blob(_blob_name(name))
        blob.upload_from_string(data, content_type=content_type)
        return f"gs://{os.environ['GCS_BUCKET']}/{_blob_name(name)}"
    LOCAL_DIR.mkdir(parents=True, exist_ok=True)
    path = LOCAL_DIR / name
    path.write_bytes(data)
    return str(path)


def _read(name: str) -> bytes:
    if _mode() == "gcs":
        return _bucket().blob(_blob_name(name)).download_as_bytes()
    return (LOCAL_DIR / name).read_bytes()


def publish(panel: pd.DataFrame, payload: dict[str, Any]) -> dict[str, str]:
    csv_bytes = panel.round(4).reset_index().assign(
        date=lambda d: d["date"].dt.strftime("%Y-%m-%d")
    ).to_csv(index=False).encode()
    return {
        PANEL_NAME: _write(PANEL_NAME, csv_bytes, "text/csv"),
        PAYLOAD_NAME: _write(PAYLOAD_NAME, json.dumps(payload, indent=2).encode(), "application/json"),
    }


def read_panel() -> pd.DataFrame:
    from io import BytesIO

    df = pd.read_csv(BytesIO(_read(PANEL_NAME)), parse_dates=["date"])
    return df.set_index("date")


def read_payload() -> dict[str, Any]:
    return json.loads(_read(PAYLOAD_NAME))
