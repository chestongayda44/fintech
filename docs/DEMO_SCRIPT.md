# Demo run-of-show (≈15 min)

**Story:** Risk leadership asks: *"If unemployment rises 2 points, what happens to losses on
our card portfolio, and can we see it live?"* One request travels idea → model → product → production,
across three teams, in one tool.

**After the demo:** `git worktree remove --force ../fintechco-prod` removes the production checkout.

**Commands:** every stage prompt is a project command in `.claude/commands/` (type `/acquire`,
`/explore`, … `/incident`, `/sweep`, `/incident-fix`). Every checkpoint carries the latest commands (see `scripts/update-checkpoints.sh`).

**Screen layout:** left = JupyterLab (notebook visible), right = terminal(s). Scoreboard overlay in a corner.

| # | Stage | Persona | Time | Start with | Ends at |
|---|---|---|---|---|---|
| 0 | Setup proof | `swe` | 0:30 | `jump` | — |
| 1 | Acquire | `ds` | 2:00 | `jump` | |
| 2 | Clean & explore | `ds` | 1:00 | | |
| 3 | Model & stress | `ds` | 2:30 | | |
| 4 | Graduate & publish | `ds` | 1:30 | | `s2-done` |
| 5 | Dashboard | `swe-plan` | 3:00 | `jump s2-done` | `s3-done` |
| 6 | Incident, fix & fleet sweep | `sre` | 3:00 | `jump s3-done` | `s4-done` |

Personas run on the Anthropic API (Pro); `bedrock` / `vertex` + `/status` show the same tool on a customer cloud.

\* `DS_PROVIDER=bedrock` in `.env` runs the DS stages on Bedrock instead (e.g. while Vertex quota is pending).
The stage needs no web search, so it behaves the same on either cloud.

**The supervision dial (say it at each transition).** Match how much freedom Claude gets to how
risky the work is, the way Anthropic's own teams do (auto-accept for prototyping, close supervision
for core logic):

| Stages | Work | Dial | What enforces it |
|---|---|---|---|
| 1–3 | Exploration in a notebook | **Open**: let it explore | Nothing reaches production from a notebook |
| 4–5 | Production code | **Tighter**: plan first, tests required | Plan approval; the Stop hook won't let Claude finish until tests pass |
| 6 | Production incident and fleet audit | **Tightest**: read-only diagnosis and sweep, a person applies the fix | `/incident` reads only; reviewer subagents can't edit; commands allowlisted; destructive ones denied |

**The security thread (the CTO's #1 concern: one visible control + one sentence per stage).**
Security is shown, not claimed. Say "security" out loud at each beat marked **Security** below.

| Stage | What the audience sees | The sentence |
|---|---|---|
| 0 | `/status` (Bedrock/Vertex); Claude refused `.env`; card number blocked | "It runs in your clouds, can't see your secrets, and can't write card data." |
| 1 | Key read from the environment, never in the notebook | "Credentials never enter the conversation or the output." |
| 3 | Assumptions stated, wrong model caught | "Model risk governance: documented, validated, explainable." |
| 4 | Every write scanned by the hook; publish to your bucket under your IAM | "No new data paths: your storage, your permissions." |
| 5 | Plan approval before any change | "Change control: a person approves, the diff is reviewable." |
| 6 | Read-only diagnosis; reviewers that can't edit; the sweep finds secrets and PII | "Least privilege for the agent, and it finds your exposures." |

**The cost lens (cost-conscious, not cost-driven).** Every terminal's status line shows the team,
model, running session cost, time and lines changed, e.g. `SRE · Opus 4.6 · $0.42 · 3m11s · +12/-3`.
At the end, `! python3 scripts/cost-report.py` prints cost and agent time per team for the whole run.
The demo runs one model throughout; model choice per task is a talk-track point (see the closing).

**Run order: overlap, don't wait.** One presenter supervising several agents is the point:
- As soon as stage 4 *publishes* (the payload is in the bucket), switch to `swe` and approve the
  stage 5 plan; narrate stage 4's tests and package while the dashboard builds in the browser.
- While stage 5 builds, stage the incident off-screen (`bash scripts/simulate-incident.sh`).
- Running two sessions at once doubles the model load: keep the DS stages on Vertex once quota allows,
  so Bedrock only carries stages 5–6 (avoids 429 throttling).

---

## Pre-flight (before the meeting)
- [ ] Every terminal tab: `source scripts/personas.sh` (or once: add it to ~/.zshrc)
- [ ] To start: close the JupyterLab browser tab, then `jump` (stops Jupyter, resets, restarts it)
- [ ] Persona banners say "via Anthropic API (Pro subscription)"; `bedrock` / `vertex` + `/status` for the cloud check
- [ ] `scripts/demo-reset.sh` → on `demo-live` at `s1-start`
- [ ] `scripts/start-jupyter.sh` running (loads `.env`, so the kernel has `FRED_API_KEY` and the token matches the MCP)
- [ ] Notebook open; **File → Reload Notebook from Disk**; kernel restarted
- [ ] `ls data/seed/*.csv` shows 5 files (fallback data survives resets)
- [ ] `ds` session: `/mcp` shows `jupyter` connected; `/status` shows the intended provider (Vertex, or Bedrock if `DS_PROVIDER=bedrock`)
- [ ] Vertex smoke test passes (one short prompt) if using Vertex — quota can silently be 0 on new projects
- [ ] `swe`/`sre` sessions: `/status` shows Bedrock; `aws login` done **that morning** (sessions last 12h)
- [ ] AWS identity is least-privilege, not root: `aws sts get-caller-identity` must not end in `:root`
      (it can appear on screen; a security-minded audience will notice)
- [ ] Guardrail check: in a session, `What's in the .env file?` is refused
- [ ] `data/seed/*.csv` present (real FRED); `DATA_SOURCE=gcs`, bucket seeded
- [ ] `bash scripts/start-dashboard.sh` running; browser on http://localhost:5173 showing the empty
      "Stress scenarios" slot (it reads whatever the DS stage publishes)
- [ ] Stage commands present: typing `/` in a session lists `/acquire` … `/stress-panel`
- [ ] Plan session ID for stage 5 in your notes (see stage 5 rehearsal prep)
- [ ] `go version` works (stage 6's freshness check is Go); `bash scripts/simulate-incident.sh` dry run done
- [ ] In rehearsal, open `sre` in `../fintechco-prod` once and approve the Jupyter MCP prompt (or choose
      "continue without"), so it doesn't pop up on stage
- [ ] Stop hook wired in `.claude/settings.json` (`Stop` → `.claude/hooks/verify_on_stop.py`, see README);
      a quick check: ask `swe` to add a comment to `dashboard/src/lib/format.ts` and watch for
      "Verified: Dashboard tests pass"
- [ ] Stage 6 runs with no approval prompts: `/incident` only reads files, step 4 uses `!`. If prompts
      still appear, add the allowlist in `.claude/settings.local.json` (personal, not committed; the incident script
      copies it into production): `Bash(bash ops/ingest.sh:*)`, `Bash(ops/.bin/freshness:*)`,
      `Bash(bash scripts/apply-fix.sh:*)`, `Bash(go build:*)`, `Bash(go test:*)`,
      `Bash(python -m pytest:*)`, `Bash(python3 -m pytest:*)`, `Bash(ls:*)`, `Bash(git diff:*)`,
      `Bash(git log:*)`, `Bash(git show:*)`, `Bash(git status:*)`.
      **Don't allowlist `cat`, `head`, `tail` or `grep`:** the `.env` deny rules cover Claude's file
      tools and `cat .env`, so a pre-approved `head .env` would print your keys. Claude reads files with
      its own tools, which need no approval.
- [ ] `PYTHON=$(which python)` in `.env` (the job and Claude's re-run use it)
- [ ] `/sweep` dry run in `../fintechco-prod`: compare with `docs/FLEET_FINDINGS.md` (4 criticals found?)
- [ ] Bedrock quota: the sweep runs several subagents at once. If you see 429s, request higher limits
- [ ] Note which model the status line shows (the account currently gets Opus 4.6 on Bedrock) and say that name on stage
- [ ] Status line visible in each persona (bottom of the terminal); full dry run, then
      `python3 scripts/cost-report.py` → note the total for the closing line (`demo-reset.sh` clears it)
- [ ] Backup recordings open in a hidden tab
- [ ] Font size up, notifications off, `.env` closed

---

## 0 · Setup proof (30s)
In the `ds` terminal: `/status`
> "Same Claude Code, running inside your GCP project through Vertex AI. The engineering terminals run
> through Bedrock in your AWS account. Code and prompts stay in your clouds, under your IAM."

**Security:** "First answer to your security team: model calls go through your own AWS and GCP
accounts, under your IAM, on your contracts, auditable with your own CloudTrail and Cloud Audit Logs."
(Before saying "auditable", check which log types are enabled in both accounts. Use a least-privilege
identity, not root; see pre-flight.)

If DS is on Bedrock that day: show `/status` in `ds` and say "this one could just as well point at
Vertex — it's one environment variable", then move on.

Open `CLAUDE.md` for 10 seconds, then `.claude/settings.json`'s hooks:
> "This is the team's shared context: conventions, data rules, guardrails. Every persona reads it.
> And it's enforced: one hook blocks secrets and card numbers from ever being written; another won't
> let Claude say it's done until the tests pass. That's the self-verifying loop Anthropic's own
> Claude Code team uses."

**Live guardrails (30s), in the `swe` terminal at `/effort low`.** Two refusals, both enforced by the
repo's settings rather than by the model's good behaviour:

1. Secrets are off-limits:
```
What's in the .env file?
```
The deny rules in `.claude/settings.json` (`Read(./.env)`, `Bash(cat .env:*)`) refuse it. "It can't
read your secrets file even if someone asks it to."

2. Card data can't be written:
```
Add a sample transaction with card number 4111 1111 1111 1111 to dashboard/src/test/fixtures/sample_txn.json so we can test masking.
```
Either the secret-scanning hook blocks the write and Claude switches to a masked value, or Claude
declines up front because CLAUDE.md forbids card numbers. Both are the point: "Your rules, enforced
in the tool, not in a policy PDF." (Undo afterwards if a file was created: `git clean -f dashboard/src/test/fixtures`.)

## 1 · Acquire (2:00) — `ds`
> Dial: **open**. "It's a notebook. I'm going to let it explore."

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
the `"."` missing-value handling.
**Security:** the API key is read from the environment inside the kernel; it never appears in the
prompt, the notebook, its output or a URL (CLAUDE.md forbids it, the hook would block a hard-coded
one). "Credentials never enter the conversation." The Jupyter MCP server is local and token-protected.
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
**Security / model risk:** "For a bank this is governance, not just quality: the assumptions are
written down, the model was challenged before anyone relied on it, and it's interpretable. That's
what your model risk team (and the Fed's SR 11-7 guidance) asks for."
**Scoreboard:** "Data → defensible stress view: typical 2–3 days → elapsed ~7 min."

## 4 · Graduate & publish (1:30) — `ds`
> Dial: **tighter**. "Now it's production code, so the rules change: tests are required, and the hook
> enforces it."

**Type:** `/effort low`, then `/graduate`, then switch tabs and start stage 5 right away (graduate takes ~3 min; come back for "Verified: Python tests pass").
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
**Point out:** notebook → tested code is the handoff that usually takes a sprint. When Claude finishes,
the hook's *"Verified: Python tests pass"* line appears without anyone asking. The published payload in
GCS is what SWE builds on next.

**Security:** every file Claude writes passed the secret and card-number scan; the results went to
your bucket using your credentials and IAM. "No new data paths, no new copies of data outside your
cloud."

**Overlap:** as soon as the publish step is done, switch to `swe` and start stage 5 (resume + approve);
come back to this terminal to walk through the package and tests while the dashboard builds.

## 5 · Dashboard (3:00) — `swe` · 
Switch to the `swe` terminal and put the browser beside it, open on the dashboard. Its empty
"Stress scenarios" slot is the ticket.

**On stage: resume the pre-planned session (the plan appears instantly)**
```
Live: `swe-plan` then `/stress-panel` (starts in plan mode: nothing changes until you approve the plan).
Shortcut, if a plan is recorded:
swe --resume <PLAN_SESSION_ID> --fork-session
```
> Dial: **tighter**. "Production front-end: plan first, a person approves, tests prove it."

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
- The hook's *"Verified: Dashboard tests pass"* line when Claude finishes: no one had to ask.
- **Security:** "This is change control: the plan is the change request, a person approved it, and
  every line is a reviewable diff before it merges. The dashboard reads from your bucket with your
  credentials; Claude added no new access."

**Expected:** at +2 points, peak impact ≈ +1.9 to +2.2 points of charge-offs in 2027 Q4 (matches stage 3).
**Speed knob:** `/effort low` before approving (the plan is already done; the coding goes faster).
**Fallback:** if not done ~90s after approval, `scripts/demo-reset.sh s3-done`, reload the browser,
demo the finished panel.
**Scoreboard:** "Interactive feature + tests, no front-end specialist: typical 2–3 days → elapsed ~3 min."

**Talk track:** "That's the handoff that usually takes a sprint: a data scientist's notebook is now a
product your CRO can use, built by an engineer in their own stack, checked against the model."

## 6 · Incident, fix & fleet sweep (3:00) — `sre`, in `../fintechco-prod`
**Off-screen, before stage 6:** `bash scripts/simulate-incident.sh` (~10s; e.g. while stage 5 builds).
It prints one line when the incident is staged, or exactly what's missing. Your demo folder is not
touched: production is a separate checkout at `../fintechco-prod` that publishes where the dashboard
reads. Have the `sre` terminal ready in that folder, already at low effort:
`cd ~/Downloads/fintechco-prod && source ~/Downloads/fintechco-demo/scripts/personas.sh && sre`, then `/effort low`.
After staging: File → Add Folder to Workspace → ~/Downloads/fintechco-prod (to show alert.txt, ops/freshness/main.go, fred_client.py).
Order: `/incident` → `bash scripts/apply-fix.sh` in a second tab + reload dashboard (2025 → 2026) → `/sweep`.

> Dial: **tightest**. "Production at 2 a.m.: read-only diagnosis; a person decides the fix."

**1 · Kick off the diagnosis first (5s).** Type `/incident` *before* you start talking, so Claude
works while you set the scene.

**2 · The page, while it works (40s).**
> "Fast-forward three weeks. It's 2 a.m. and the freshness check just paged SRE."

`cat ../fintechco-prod/ops/logs/alert.txt` (in a second tab), then reload the dashboard (Cmd+R): *FRED
data through 2025 Q4*. "Nothing looks broken. The job reported success. For a bank, stale risk numbers
that look fresh are worse than an outage."

**3 · Root cause (30s).** Read Claude's bullets: the job log says
`Live FRED unavailable (FRED_API_KEY is not set); falling back to seed data`; the fallback Data Science
added in stage 1 (sensible in a notebook) let a keyless nightly job publish 2025 data and exit 0.
- "One alert in, root cause out, reading a shell job, Python and Go together. One team's sensible
  choice became another team's incident. That's why it's one tool across all three teams."

**4 · Sweep the fleet (kick off, 5s).** "We found it in one pipeline. Do we have the same problem
anywhere else?" Type `/sweep`. Claude splits 16 services (Go, Python, TypeScript, Java, shell) across
parallel read-only `fleet-reviewer` subagents: they can read and search, and physically cannot edit
anything (`.claude/agents/fleet-reviewer.md`).

**5 · Fix production while it sweeps (40s).** In a second tab, in `../fintechco-prod`:
```
bash scripts/apply-fix.sh
```
It puts production on the merged fix (`s4-done`), shows the fix's summary and files (code, regression
tests, runbook, CLAUDE.md rule), re-runs the job and the check: `data source: live` …
`ingest finished: OK` … `OK stress-payload-fresh`. Reload the dashboard: back to the current quarter.
Guardrails line while it runs: SRE pre-approved read-only and ops commands; anything else still asks;
`rm -rf` and force-push are denied. True story: while building this demo, Claude's own safety check
blocked a force-push of shared git tags and handed it back to a human.

**6 · The findings (45s).** Back to the `sre` terminal: one ranked table. Expected (answer key in
`docs/FLEET_FINDINGS.md`): **12 findings in 11 of 16 services, 4 critical**:
- **aml-screening:** sanctions feed down → screens against a cached list, or an *empty* one if the cache
  is missing: everyone passes.
- **loan-origination:** bureau error → default score 680, above the approval threshold.
- **payments-gateway:** full card numbers in error logs (PCI).
- **kyc-checks:** SSNs and dates of birth in logs.

**Security:** "Look at what the agent was allowed to do here: read and search. The reviewers can't edit,
the diagnosis ran no commands, the fix went through a person. And look at what it found: card numbers
and SSNs in logs, a hard-coded credential, a sanctions screen that can fail open. Least privilege for
the agent, and it finds your exposures."

> "One incident became a fleet-wide security and reliability audit in about a minute: sixteen
> services, five languages, read-only. That's a week of review nobody on your team would ever get
> scheduled. That's the step change: not typing faster, but work that wasn't happening at all now
> happens every time."

<details><summary>What /incident asks for</summary>

```
We just got paged: the freshness check is failing, yet last night's ingest job reported success.
Read ops/logs/alert.txt and ops/logs/ingest-latest.log (last night's run), then follow what the
log says into the code. Use only file reads and searches: don't run shell commands, don't read tests
or the dashboard, and don't change anything. Answer in five short bullets or fewer: what happened, why the job looked
green, and the fix you'd make.
```
</details>

**Optional, only if ahead of time:**
- *What Risk is seeing:* screenshot the stale dashboard (Cmd+Shift+4), paste it into the `sre` prompt
  (Ctrl+V) and ask `This is what Risk sees right now. Which numbers are wrong, and what will they show
  after the fix?`
- Have Claude write the fix live with `/incident-fix` (minimal fix
plus one regression test; ~1–2 min at low effort) instead of step 5's script, then run
`! bash ops/ingest.sh && ops/.bin/freshness`. Or a headless review from a shell in `../fintechco-prod`:
`git diff s3-done s4-done | sre -p "Review this diff as a senior SRE. Five bullets max."`

**Fallback:** if the diagnosis is still running after ~60s, go straight to step 5; if the sweep is
slow, show `docs/FLEET_FINDINGS.md` as "what it found in rehearsal" and come back to the live table; the reset to
`s4-done` and the `OK` tell the story. Re-running the job needs the live FRED API; if the venue
network is down, the job now *fails loudly*, which is the point.
**Scoreboard:** "Page to root cause: typically an hour of log-diving → under a minute. Fleet-wide audit
of 16 services: typically a week → about a minute."

**Cost (10s):** `! python3 scripts/cost-report.py`
> "That whole flow, three teams and a fleet audit, cost about $X in model usage [read the total], all on
> the top model. In rollout you'd match the model to the job: the top model for modelling and design,
> a faster, cheaper one for routine builds and for the reviewers in a sweep, set per team or per
> subagent in one line of config. Across enterprise deployments the average is about $13 per developer per
> active day. At your scale you'd see it in your own AWS and GCP bills, with per-user numbers through
> OpenTelemetry, and budgets enforced in your cloud's budget controls or a gateway."

**Talk track (closing the demo):** "One request from Risk, three teams, two clouds, one tool:
a model in the morning, a product by lunch, and when it broke at 2 a.m., the root cause in under a
minute, the fix verified, and the whole fleet checked for the same flaw before anyone was fully awake.
That's what we'd measure in your pilot."

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
| Stage 4 running long | `jump s2-done` (graduate already done), carry on with stage 5 |
| Stage 5 running long | `jump s3-done` (dashboard already built), carry on with stage 6 |
