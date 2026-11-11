# ops/ — Phase 4 (SRE stage)

- `ingest.sh` — scheduled FRED pull → publish via `risk_model.storage`
- `freshness/` — Go checker: alerts if the published panel is older than the FRED release cadence
- `RUNBOOK.md` — what to do when ingestion or freshness fails

Planned incident for the live demo: FRED returns `"."` for a missing observation;
an unhardened parser breaks ingestion, the freshness check fires, and Claude
diagnoses from logs, fixes, adds a regression test, and updates the runbook.
