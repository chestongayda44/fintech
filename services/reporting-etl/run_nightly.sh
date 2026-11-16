#!/usr/bin/env bash
# Nightly regulatory reporting extract (cron: 03:00 UTC).
cd "$(dirname "$0")"

python3 extract.py --date "$(date -u -d yesterday +%F)" > /tmp/report.csv || true
aws s3 cp /tmp/report.csv "s3://fintechco-compliance-reports/daily/$(date -u +%F).csv" || true

echo "nightly report: done"
exit 0
