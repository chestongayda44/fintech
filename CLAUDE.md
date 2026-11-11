# FinTechCo – Macro Credit Risk (demo repo)

Cross-team project: Data Science builds a macro stress model for our credit card
portfolio from public FRED data, Software Engineering ships it as a stress-test
dashboard, SRE keeps the data pipeline healthy.

## Layout
- `notebooks/` – exploratory work (Jupyter; the `jupyter` MCP server edits/runs the live notebook)
- `risk_model/` – production Python package that notebook logic graduates into
- `dashboard/` – TypeScript (React + Vite) stress-test app; reads the published payload
- `ops/` – ingestion script, Go freshness checker, RUNBOOK.md
- `docs/DATA_CONTRACT.md` – schema of published artifacts. **Read it before changing outputs.**

## Conventions
- Python 3.11+, type hints on public functions, `pytest` for tests (`python -m pytest -q`).
- New logic in `risk_model/` ships with tests. Don't leave notebook-only logic that production depends on.
- TypeScript: strict mode, components small, tests with Vitest.
- Prefer small, reviewable diffs. Explain modelling assumptions in plain language.

## Data rules
- FRED API key comes from the `FRED_API_KEY` env var. Never print, log, hard-code, or commit it.
- Discover and fetch FRED data through the FRED API itself (`fred/series/search`, `fred/series`,
  `fred/series/observations`) from Python, reading the key from the env. Never put the key in a URL
  you pass to a tool, a shell command, or notebook output.
- Never read `.env` files. Never log customer PII or card numbers (a hook enforces this).
- FRED returns `"."` for missing observations – treat as NaN, never as zero.
- Delinquency/charge-off series are quarterly; unemployment, fed funds, CPI are monthly.
  Aggregate monthly → quarterly by mean of available months (require ≥2 of 3) before joining.
- Storage goes through `risk_model.storage` (`DATA_SOURCE=gcs|local`). Don't call GCS directly elsewhere.
- If the FRED API is unavailable, fall back to `data/seed/` and say so.

## Modelling guardrails
- Keep models interpretable (OLS / simple time series). State assumptions and limitations.
- Sanity-check every model before sharing it: do the key effects have the economically expected
  sign (higher unemployment → higher losses)? If not, diagnose before going further.
- Lags must be computed on a gap-free quarterly index; never shift across a missing quarter.
- Correlation is not causation; scenario outputs are illustrative, not forecasts.
