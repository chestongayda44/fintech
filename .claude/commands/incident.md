---
description: "Stage 6 (SRE): diagnose the freshness page fast. Root cause and proposed fix, no changes"
---
We just got paged: the freshness check is failing, yet last night's ingest job reported success.
Read ops/logs/alert.txt and ops/logs/ingest-latest.log, then follow what the log says into the
code. Don't read tests, the dashboard or git history, and don't change anything. Answer in exactly
three bullets of one sentence each: what happened, why the job looked green, and the fix.
