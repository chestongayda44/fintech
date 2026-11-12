# ops/ — SRE

- `ingest.sh` — nightly job: FRED → model → published payload (logs in `ops/logs/`)
- `freshness/` — Go checker: pages when the published data falls behind FRED's release schedule
  (`go run ./ops/freshness`, tests: `go test ./ops/freshness`)
- `RUNBOOK.md` — what to do when the pipeline or the freshness check fails

Demo stage 6 starts from `bash scripts/simulate-incident.sh` (see docs/DEMO_SCRIPT.md).
