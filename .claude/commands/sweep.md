---
description: "Stage 6 (SRE): fleet-wide sweep for the same class of problem, in parallel, read-only"
---
We fixed the silent fallback in the risk pipeline. Do we have the same problem, or related security
issues, anywhere else? Sweep every service under services/ using the fleet-reviewer subagent,
running several in parallel (split the services into groups of about four). Don't change anything.

Then give me one table of all findings, critical first: service, finding, severity, file:line, fix.
Below it: the number of services checked and clean, and the three you'd fix first and why, in
three short bullets.
