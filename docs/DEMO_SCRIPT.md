# Demo run-of-show (≈15 min)

**Story:** Risk leadership asks: *"If unemployment rises 2 points, what happens to losses on
our card portfolio, and can we see it live?"* One request travels idea → model → product → production,
across three teams, in one tool.

**Commands:** every stage prompt is a project command in `.claude/commands/` (type `/acquire`,
`/explore`, …). Every checkpoint carries the latest commands (see `scripts/update-checkpoints.sh`).

**Screen layout:** left = JupyterLab (notebook visible), right = terminal(s). Scoreboard overlay in a corner.

| # | Stage | Persona / cloud | Time | Checkpoint |
|---|---|---|---|---|
| 0 | Setup proof | all | 0:30 | — |
| 1 | Acquire | `ds` · Vertex* | 2:00 | `s1-start` |
| 2 | Clean & explore | `ds` · Vertex* | 1:30 | |
| 3 | Model & stress | `ds` · Vertex* | 2:30 | |
| 4 | Graduate & publish | `ds` · Vertex* | 1:30 | `s2-done` |
| 5 | Dashboard | `swe` · Bedrock | 3:00 | `s3-done` |
| 6 | Incident & fix | `sre` · Bedrock | 3:00 | `s4-done` |

\* `DS_PROVIDER=bedrock` in `.env` runs the DS stages on Bedrock instead (e.g. while Vertex quota is pending).
The stage needs no web search, so it behaves the same on either cloud.

---

## Pre-flight (before the meeting)
- [ ] `scripts/demo-reset.sh` → on `demo-live` at `s1-start`
- [ ] `scripts/start-jupyter.sh` running (loads `.env`, so the kernel has `FRED_API_KEY` and the token matches the MCP)
- [ ] Notebook open; **File → Reload Notebook from Disk**; kernel restarted
- [ ] `ls data/seed/*.csv` shows 5 files (fallback data survives resets)
- [ ] `ds` session: `/mcp` shows `jupyter` connected; `/status` shows the intended provider (Vertex, or Bedrock if `DS_PROVIDER=bedrock`)
- [ ] Vertex smoke test passes (one short prompt) if using Vertex — quota can silently be 0 on new projects
- [ ] `swe`/`sre` sessions: `/status` shows Bedrock; `aws sso login` fresh
- [ ] `data/seed/*.csv` present (real FRED); `DATA_SOURCE=gcs`, bucket seeded
- [ ] `bash scripts/start-dashboard.sh` running; browser on http://localhost:5173 showing the empty
      "Stress scenarios" slot (it reads whatever the DS stage publishes)
- [ ] Stage commands present: typing `/` in a session lists `/acquire` … `/stress-panel`
- [ ] Plan session ID for stage 5 in your notes (see stage 5 rehearsal prep)
- [ ] `go version` works (stage 6's freshness check is Go); `bash scripts/simulate-incident.sh` dry run done
- [ ] Backup recordings open in a hidden tab
- [ ] Font size up, notifications off, `.env` closed

---

## 0 · Setup proof (30s)
In the `ds` terminal: `/status`
> "Same Claude Code, running inside your GCP project through Vertex AI. The engineering terminals run
> through Bedrock in your AWS account. Code and prompts stay in your clouds, under your IAM."

If DS is on Bedrock that day: show `/status` in `ds` and say "this one could just as well point at
Vertex — it's one environment variable", then move on.

Open `CLAUDE.md` for 10 seconds:
> "This is the team's shared context: conventions, data rules, guardrails. Every persona reads it."

## 1 · Acquire (2:00) — `ds`
**Type:** `/acquire`
<details><summary>Full prompt</summary>

```
Risk leadership wants to know how a 2-point rise in US unemployment would hit credit card
losses. In the open notebook notebooks/macro_credit_risk.ipynb, search FRED's own catalog
(series/search API, key in the FRED_API_KEY env var) for credit card delinquency and charge-off
rates, the unemployment rate, the fed funds rate and CPI. Pick the best series for each and
justify the choice by frequency, seasonal adjustment and coverage. Then add a markdown cell
documenting the picks and a code cell that pulls them, falling back to data/seed/ if the API
fails. Run it and summarise what we got.
```
</details>

**Point out:** Claude searching FRED's catalog and *choosing* series with reasons (what an analyst does);
cells appearing *in the notebook* and executing;
the `"."` missing-value handling; key read from env, never shown.
**Scoreboard:** "Find & pull 5 sources: typical ½ day → elapsed ~2 min."

## 2 · Clean & explore (1:30) — `ds`
**Type:** `/explore`
<details><summary>Full prompt</summary>

```
Align everything to a gap-free quarterly panel (charge-offs and delinquency are quarterly, the rest
monthly; average the available months, at least 2 of 3), add YoY CPI inflation, then chart
unemployment against charge-offs and delinquency, shading the 2008 and 2020 recessions.
```
</details>

**Point out:** mixed frequencies handled correctly; the real-world gap (a missing FRED month in late
2025) handled instead of silently corrupting the lags.

## 3 · Model & stress (2:30) — `ds`
**Type:** `/fit-model`
<details><summary>Full prompt</summary>

```
Fit a simple, interpretable model of how unemployment drives our card losses, using delinquency on
its own lag plus lagged unemployment and fed funds, from 2000 onward, with HAC standard errors.
Sanity-check it before going further.
```
</details>

**What happens (rehearsed):** the levels model comes back with the **wrong sign** (higher unemployment →
*lower* delinquency). Following CLAUDE.md's sanity-check rule, Claude flags it and diagnoses it from the
chart: losses track unemployment *rising*, not unemployment being *high* (2010–14), and 2020 broke the
link (stimulus, forbearance).

**Follow-up (if Claude hasn't already proposed the fix):** type `/fix-model`
<details><summary>Full prompt</summary>

```
Fix it: model charge-offs on the 1-year change in unemployment, exclude the pandemic quarters, and
show how much that exclusion matters. Then project 8 quarters under baseline vs. unemployment +2pp
ramped over 4 quarters and chart both against history.
```
</details>

**Expected on real data (through 2026Q2):** unemployment effect ≈ +0.43 to +0.56 (t≈4.6–6.4, depending on
the fit start year) vs ≈ +0.09 with pandemic quarters left in; peak stress impact ≈ **+1.9 to +2.2pp
charge-offs**, about 6 quarters out. (Rehearsal 11 Nov: +0.54, +2.2pp at 2027Q4.)

**Talk track:** "This is the moment that matters to your data scientists. The first model looked great —
R² 0.97 — and was wrong. Claude caught it because your team's standards are written into CLAUDE.md, and
it explained *why* in economic terms. That's the difference between a code generator and a colleague."
**Scoreboard:** "Data → defensible stress view: typical 2–3 days → elapsed ~7 min."

## 4 · Graduate & publish (1:30) — `ds`
**Type:** `/graduate`
<details><summary>Full prompt</summary>

```
Graduate this into the risk_model package so production doesn't depend on the notebook: typed
functions for fetching, quarterly transforms, the model and the projection, plus pytest tests
(including the "." missing-value case, the ≥2-of-3-months rule
and gap-free lags). Follow docs/DATA_CONTRACT.md, publish the panel and
stress payload through risk_model.storage, and run the tests.
```
</details>

**Fallback / time-saver:** if over time, `scripts/demo-reset.sh s2-done` and show the finished package
and green tests.
**Point out:** notebook → tested code is the handoff that usually takes a sprint. The published payload
in GCS is what SWE builds on next.

## 5 · Dashboard (3:00) — `swe` · Bedrock
Switch to the `swe` terminal and put the browser beside it, open on the dashboard. Its empty
"Stress scenarios" slot is the ticket.

**On stage: resume the pre-planned session (the plan appears instantly)**
```
swe --resume <PLAN_SESSION_ID> --fork-session
```
Scroll the plan for ~15s: "here's exactly what it intends to change; nothing happens until a person
approves." Approve with auto-accept edits. (If the approve buttons don't reappear after resume:
Shift+Tab out of plan mode and type `Approved, implement the plan.`)

Then **turn to the room** for 60–90s (scoreboard, "one CLAUDE.md, three teams") while it builds. The
panel appears in the browser on its own as files land (dev server hot reload). Drag the slider, then
run `npm test` in `dashboard/` to show the parity tests.

**Rehearsal prep (once; reusable thanks to `--fork-session`):**
1. `scripts/demo-reset.sh s2-done`, then `bash scripts/start-dashboard.sh` in its own tab.
2. `swe`, press Shift+Tab until **plan mode** is on, type `/stress-panel`, wait for the plan.
3. At the approval prompt, **don't approve**: run `/status`, copy the session ID, `/exit`.
4. Put the ID in the command above (and in your notes). Every `--fork-session` resume starts from
   that same un-approved plan, so it works for every rehearsal and the meeting.

<details><summary>What /stress-panel asks for</summary>

```
Risk leadership wants to explore this themselves. In dashboard/, fill the empty "Stress scenarios"
slot with a stress panel: a slider for an unemployment rise from 0 to 5 points (phased in over a
year), the no-shock and stressed charge-off paths against recent history, and a one-sentence
headline with the peak impact. Compute projections in the browser from the published payload,
following the projection rule in docs/DATA_CONTRACT.md, and add Vitest tests proving the
TypeScript matches the scenarios the Python model published.
```
</details>

**Point out:**
- The plan + approval step: governance before any code changes.
- `/stress-panel` and the other stage commands live in the repo (`.claude/commands/`): the team's
  playbook, shared like code.
- The panel appears in the browser *while Claude edits*. Drag the slider: the headline sentence and
  both charts move together.
- The parity tests: TypeScript reproduces the Python model's published scenarios to 3 decimals.
  "The dashboard can't quietly disagree with the model. A test fails first."

**Expected:** at +2 points, peak impact ≈ +1.9 to +2.2 points of charge-offs in 2027 Q4 (matches stage 3).
**Speed knob:** `/effort low` before approving (the plan is already done; the coding goes faster).
**Fallback:** if not done ~90s after approval, `scripts/demo-reset.sh s3-done`, reload the browser,
demo the finished panel.
**Scoreboard:** "Interactive feature + tests, no front-end specialist: typical 2–3 days → elapsed ~3 min."

**Talk track:** "That's the handoff that usually takes a sprint: a data scientist's notebook is now a
product your CRO can use, built by an engineer in their own stack, checked against the model."

## 6 · Incident & fix (3:00) — `sre` · Bedrock
**Set the scene (before you say anything):** run `bash scripts/simulate-incident.sh` in a spare tab
(it takes ~10s; or run it during stage 5's build). It resets to `s3-done`, runs the nightly job the
way production does after a key rotation (no `FRED_API_KEY`), and runs the freshness check.

> "Fast-forward three weeks. It's 2 a.m. and the freshness check just paged SRE."

Show the alert (`cat ops/logs/alert.txt`), then reload the dashboard: it says *FRED data through
2025 Q4*. "Nothing looks broken. The job reported success. For a bank, stale risk numbers that look
fresh are worse than an outage."

**Type:** `/incident` in the `sre` terminal
<details><summary>Full prompt</summary>

```
We just got paged: the freshness check is failing (the alert is in ops/logs/alert.txt), yet last
night's ingest job reported success. Investigate using the job logs in ops/logs/ and the code, and
find the root cause. Fix it so this can't fail silently again, add a regression test, and update
ops/RUNBOOK.md. Then re-run the ingest job and the freshness check to confirm we're healthy.
```
</details>

**What happens (rehearsed):** Claude reads the alert and the job log, finds
`WARNING Live FRED unavailable (FRED_API_KEY is not set); falling back to seed data`, traces it to
the seed fallback in `risk_model` (the one Data Science added in stage 1, sensible in a notebook,
dangerous in a nightly job), and fixes it: fallback becomes opt-in for dev only, the job fails
loudly, payloads record `data_source`, plus a regression test and a new runbook section. It re-runs
the job (with the key in its environment, so `data source: live`) and the freshness check prints `OK`.
Reload the dashboard: back to the current quarter.

**Point out:**
- One alert in, root cause out, by reading a shell job, Python and Go together. "One team's sensible
  choice became another team's incident. That's why it's one tool across all three teams."
- It fixed the class of bug, not the instance: tests, runbook, and the rule in CLAUDE.md, so nobody
  reintroduces it (stage 1's "fall back to seed" rule now says "dev only").
- Guardrails while it works: commands it runs ask first (or follow the allowlist in
  `.claude/settings.json`); destructive ones like `rm -rf` and force-push are denied outright.
  (Rehearsal tip: approve stage 6's routine commands with "Yes, and don't ask again" so they're
  allowlisted in `.claude/settings.local.json` and don't interrupt the live run.)
  True story to tell: while building this demo, Claude's own safety check blocked a force-push of
  shared git tags and handed it back to a human.

**Ship it (30s):** headless review of the fix, same as it would run in CI. Exit the session, then:
```
git diff s3-done | sre -p "Review this diff as a senior SRE: correctness, failure modes, and anything that could page us again. Five bullets max."
```
"That's the same agent running non-interactively, in CI on every PR, through your Bedrock account."

**Fallback:** `scripts/demo-reset.sh s4-done`, show `git show --stat HEAD`, `python -m pytest -q`, and
the new runbook section. Re-running the job needs the live FRED API; if the venue network is down,
say so: the job now *fails loudly*, which is the point.
**Scoreboard:** "Page to verified fix, with test and runbook: typical 2–4 hours → elapsed ~3 min."

**Talk track (closing the demo):** "One request from Risk, three teams, two clouds, one tool:
a model in the morning, a product by lunch, and when it broke at 2 a.m., fixed with a test and a
runbook before anyone was fully awake. That's what we'd measure in your pilot."

---

## If things go wrong
| Symptom | Move |
|---|---|
| FRED/API slow | Already handled: notebook falls back to seed. Say so — it's a feature. |
| MCP disconnects | `/mcp` → reconnect; or let Claude write the cells to the .ipynb file, then reload |
| Stage > 60s over | `scripts/demo-reset.sh <next>-done`, keep talking |
| Cloud auth prompt | Switch `DATA_SOURCE=local` (in `.env`, restart persona) |
| Stage 6 re-run can't reach FRED | That's the fix working: the job fails loudly. Show the tests and runbook instead |
| Anything else | Play the stage recording, narrate over it |
