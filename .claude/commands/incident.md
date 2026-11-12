---
description: "Stage 6 (SRE): respond to the freshness page, find the root cause, fix it for good"
---
We just got paged: the freshness check is failing (the alert is in ops/logs/alert.txt), yet last
night's ingest job reported success. Investigate using the job logs in ops/logs/ and the code, and
find the root cause. Fix it so this can't fail silently again, add a regression test, and update
ops/RUNBOOK.md. Then re-run the ingest job and the freshness check to confirm we're healthy.
