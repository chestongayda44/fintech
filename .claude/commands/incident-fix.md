---
description: "Stage 6 (SRE): apply the minimal fix with one regression test, run the tests"
---
Go ahead with the fix: production must fail loudly instead of publishing cached seed data. Keep the
diff minimal: the code change plus one regression test, then run the Python tests. Don't touch the
runbook or docs; summarise the change in two sentences when done.
