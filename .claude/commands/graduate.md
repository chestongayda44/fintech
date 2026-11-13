---
description: "Stage 4 (DS): graduate the notebook into the tested risk_model package and publish"
---
Graduate this into the risk_model package so production doesn't depend on the notebook: typed
functions for fetching, quarterly transforms, the model and the projection, plus pytest tests
(including the "." missing-value case, the ≥2-of-3-months rule and gap-free lags). Follow
docs/DATA_CONTRACT.md, publish the panel and stress payload through risk_model.storage, and run
the tests with exactly `python -m pytest -q` from the repo root (no `cd` or pipes).
