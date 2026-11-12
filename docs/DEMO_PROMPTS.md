# What Claude is asked

Each slash command typed in the terminal sends Claude the request shown under it.

---

## 0 · Guardrails, live

🔵 **Software Engineering**, via Amazon Bedrock

```
What's in the .env file?
```

```
Add a sample transaction with card number 4111 1111 1111 1111 to dashboard/src/test/fixtures/sample_txn.json so we can test masking.
```

**Result:** Both refused: the first by the repo's permission rules, the second by a hook that scans every write for card numbers.

**Supervision:** Rules set by the team, enforced by the tool.  
**Security:** It can't read your secrets and can't write card data, whoever asks.

---

## 1 · `/acquire`

🟣 **Data Science**, via Google Vertex AI (or Amazon Bedrock)

> Risk leadership wants to know how a 2-point rise in US unemployment would hit credit card losses. In the open notebook notebooks/macro_credit_risk.ipynb, search FRED's own catalog (series/search API, **key in the FRED_API_KEY env var**) for credit card delinquency and charge-off rates, the unemployment rate, the fed funds rate and CPI. Pick the best series for each and **justify the choice** by frequency, seasonal adjustment and coverage. Then add a markdown cell documenting the picks and a code cell that pulls them, falling back to data/seed/ if the API fails. Run it and summarise what we got.

**Supervision:** Open: exploring in a notebook.  
**Security:** The API key is read from the environment; it never appears in the notebook or the chat.

---

## 2 · `/explore`

🟣 **Data Science**, via Google Vertex AI (or Amazon Bedrock)

> Align everything to a gap-free quarterly panel (charge-offs and delinquency are quarterly, the rest monthly; average the available months, **at least 2 of 3**), add YoY CPI inflation, then chart unemployment against charge-offs and delinquency, shading the 2008 and 2020 recessions.

**Supervision:** Open: exploring in a notebook.  
**Security:** The team's data rules live in CLAUDE.md, and every session follows them.

---

## 3 · `/fit-model`

🟣 **Data Science**, via Google Vertex AI (or Amazon Bedrock)

> Fit a simple, interpretable model of how unemployment drives our card losses, using delinquency on its own lag plus lagged unemployment and fed funds, from 2000 onward, with HAC standard errors. **Sanity-check it before going further.**

**Supervision:** Open, with a check built in.  
**Security:** Model risk: the model is challenged before anyone relies on it.

---

## 3 · `/fix-model`

🟣 **Data Science**, via Google Vertex AI (or Amazon Bedrock)

> Fix it: model charge-offs on the 1-year change in unemployment, exclude the pandemic quarters, and **show how much that exclusion matters**. Then project 8 quarters under baseline vs. unemployment +2pp ramped over 4 quarters and chart both against history.

**Supervision:** Open, with a check built in.  
**Security:** Model risk: interpretable, documented and validated.

---

## 4 · `/graduate`

🟣 **Data Science**, via Google Vertex AI (or Amazon Bedrock)

> Graduate this into the risk_model package **so production doesn't depend on the notebook**: typed functions for fetching, quarterly transforms, the model and the projection, plus **pytest tests** (including the "." missing-value case, the ≥2-of-3-months rule and gap-free lags). Follow docs/DATA_CONTRACT.md, publish the panel and stress payload through risk_model.storage, and run the tests with exactly `python -m pytest -q` from the repo root (no `cd` or pipes).

**Supervision:** Tighter: production code; Claude can't finish until the tests pass.  
**Security:** Every write is scanned; data is published to your bucket under your IAM.

---

## 5 · `/stress-panel`

🔵 **Software Engineering**, via Amazon Bedrock

> Risk leadership wants to explore this themselves. In dashboard/, fill the empty "Stress scenarios" slot with a stress panel: a slider for an unemployment rise from 0 to 5 points (phased in over a year), the no-shock and stressed charge-off paths against recent history, and a one-sentence headline with the peak impact. Compute projections in the browser from the published payload, following the projection rule in docs/DATA_CONTRACT.md, and add **Vitest tests proving the TypeScript matches** the scenarios the Python model published. Run the tests with exactly `npm test --prefix dashboard` from the repo root (no `cd`, `npx` or pipes).

**Supervision:** Tighter: a person approves the plan before any change.  
**Security:** Change control: the plan is approved and the diff is reviewable.

---

## 6 · `/incident`

🟢 **Site Reliability**, via Amazon Bedrock

> We just got paged: the freshness check is failing, yet last night's ingest job reported success. Read ops/logs/alert.txt and ops/logs/ingest-latest.log (last night's run), then follow what the log says into the code. **Use only file reads and searches**: don't run shell commands, don't read tests or the dashboard, and **don't change anything**. Answer in five short bullets or fewer: what happened, why the job looked green, and the fix you'd make.

**Supervision:** Tightest: diagnosis is read-only.  
**Security:** Least privilege: it investigates production without being able to change it.

---

## 6 · `/sweep`

🟢 **Site Reliability**, via Amazon Bedrock

> We fixed the silent fallback in the risk pipeline. Do we have the same problem, or related security issues, anywhere else? Sweep every service under services/ using the fleet-reviewer subagent, running several in parallel (split the services into groups of about four). **Don't change anything.**
>
> Then give me one table of all findings, critical first: service, finding, severity, file:line, fix. Below it: the number of services checked and clean, and the three you'd fix first and why, in three short bullets.

**Supervision:** Tightest: the reviewers can only read.  
**Security:** 16 services checked for silent fallbacks, secrets in code, card data in logs and missing timeouts.

---

## 6 · The fix goes in

🟢 **Site Reliability**, via Amazon Bedrock

```
bash scripts/apply-fix.sh
```

**Result:** A person applies the team's reviewed fix; the nightly job re-runs and the freshness check passes.

**Supervision:** Tightest: a person applies the fix.  
**Security:** Claude proposed; a person decided.

---

## 6 · What it cost

**Every team**

```
python3 scripts/cost-report.py
```

**Result:** Model cost for the whole flow, per team. The authoritative figure is in your AWS and GCP bills.

**Supervision:** Cost visible per session and per team.  
**Security:** Spend lands in your own cloud billing, under your budgets and alerts.
