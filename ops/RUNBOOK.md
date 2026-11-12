# Runbook: macro credit-risk pipeline

Owner: SRE. Consumers: the stress-test dashboard (Risk leadership), Data Science.

## The pipeline
1. **Nightly ingest** (`bash ops/ingest.sh`, 02:00 UTC): pulls FRED, refits the model, publishes
   `macro_panel.csv` and `stress_payload.json` through `risk_model.storage` (GCS in production).
   Logs: `ops/logs/ingest-<timestamp>.log`.
2. **Freshness check** (`go run ./ops/freshness`, hourly): pages if the published data is behind
   FRED's release schedule or hasn't been published in 48h.
3. **Dashboard** reads the payload from the same bucket.

## Ingest job failed
Symptom: the job exits non-zero; its log ends with `ingest finished: FAILED`.
1. Read the newest log: `ls -t ops/logs/ingest-*.log | head -1 | xargs tail -50`.
2. FRED errors (HTTP 429/5xx): FRED is rate-limiting or down. Re-run later: `bash ops/ingest.sh`.
3. GCS errors: check the job's service account can write to the bucket.
4. Model errors (`Need at least 12 quarterly observations`): a FRED series changed shape; page Data Science.

## Freshness alert
Symptom: `PAGE stress-payload-stale`.
1. Check the ingest job ran: newest `ops/logs/ingest-*.log`.
2. If it failed, follow **Ingest job failed** above.
3. If it didn't run, check the scheduler, then run it by hand: `bash ops/ingest.sh`.
4. Re-run the check: `go run ./ops/freshness`.

## Rotating the FRED API key
1. Generate a new key at fred.stlouisfed.org (account > API keys).
2. Update it in the secret manager entry `fred-api-key`.
3. Revoke the old key.
