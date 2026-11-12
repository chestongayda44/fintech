#!/usr/bin/env bash
# Scheduled ingestion job (runs nightly via cron/systemd in production).
# Pulls FRED, refits the stress model and publishes the panel + stress payload through
# risk_model.storage (DATA_SOURCE=gcs in production). Logs to ops/logs/.
#
#   bash ops/ingest.sh
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p ops/logs
log="ops/logs/ingest-$(date -u +%Y%m%dT%H%M%SZ).log"

{
  echo "$(date -u +%Y-%m-%dT%H:%M:%S) ingest start host=$(hostname -s) DATA_SOURCE=${DATA_SOURCE:-local}"
  "${PYTHON:-python3}" -m risk_model
  rc=$?
  if [[ $rc -eq 0 ]]; then status="OK"; else status="FAILED (exit $rc)"; fi
  echo "$(date -u +%Y-%m-%dT%H:%M:%S) ingest finished: $status"
  exit $rc
} 2>&1 | tee "$log"
exit "${PIPESTATUS[0]}"
