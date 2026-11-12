---
description: "Stage 5 (SWE): build the dashboard's stress panel, with parity tests against the Python model"
---
Risk leadership wants to explore this themselves. In dashboard/, fill the empty "Stress scenarios"
slot with a stress panel: a slider for an unemployment rise from 0 to 5 points (phased in over a
year), the no-shock and stressed charge-off paths against recent history, and a one-sentence
headline with the peak impact. Compute projections in the browser from the published payload,
following the projection rule in docs/DATA_CONTRACT.md, and add Vitest tests proving the
TypeScript matches the scenarios the Python model published.
