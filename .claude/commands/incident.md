---
description: "Stage 6 (SRE): diagnose the freshness page fast. Root cause and proposed fix, no changes"
---
We just got paged: the freshness check is failing, yet last night's ingest job reported success.
Read ops/logs/alert.txt and ops/logs/ingest-latest.log (last night's run), then follow what the
log says into the code. Use only file reads and searches: don't run shell commands, don't read tests
or the dashboard, and don't change anything. Answer in five short bullets or fewer: what happened, why the job looked
green, and the fix you'd make.
