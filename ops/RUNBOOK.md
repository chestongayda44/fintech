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
4. **If it ran and reported OK**, see **Stale data published by a green job** below.
5. Re-run the check: `go run ./ops/freshness`.

## Stale data published by a green job
Symptom: freshness pages (`data-behind` or `seed-data`) while the ingest log ends `ingest finished: OK`.

Cause (incident 2026-11, fixed): when the FRED API was unreachable, the pipeline fell back to cached
seed data, published it and exited 0. After the FRED key rotation the job's environment had no
`FRED_API_KEY`, so every night it republished the old cache and looked healthy.

Now: seed fallback is opt-in (`ALLOW_SEED_FALLBACK=1`, laptops/notebooks only; `ops/ingest.sh` unsets
it), so production fails loudly instead, and payloads record `data_source` (`live`/`seed`), which the
freshness check pages on.

1. Confirm: `grep -l "falling back to seed" ops/logs/ingest-*.log` and check the payload's `data_source`.
2. Check the job's environment has `FRED_API_KEY` (from the `fred-api-key` secret). Never log it.
3. Re-run by hand: `bash ops/ingest.sh`. The log must say `data source: live`.
4. Re-run the check: `go run ./ops/freshness` must print `OK`.
5. Never set `ALLOW_SEED_FALLBACK` in production to make an alert go away.

## Rotating the FRED API key
1. Generate a new key at fred.stlouisfed.org (account > API keys).
2. Update it in the secret manager entry `fred-api-key`.
3. Restart or redeploy the nightly job so its environment picks up the new key.
4. Run the job by hand (`bash ops/ingest.sh`) and confirm `data source: live` in the log.
5. Revoke the old key.
