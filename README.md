# FinTechCo demo — Macro Credit Risk, idea to production

One feature, three teams, one tool. Data Science builds a macro stress model from
public FRED data (in Jupyter, via the Jupyter MCP), Software Engineering ships it
as a TypeScript stress-test dashboard, SRE hardens the pipeline. The DS persona runs
Claude Code through **Vertex AI**, SWE/SRE through **Amazon Bedrock**.

See `docs/DEMO_SCRIPT.md` for the run-of-show and exact prompts.

## One-time setup
```bash
cp .env.example .env                 # fill in keys/projects (Claude is denied read access to .env)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
set -a; source .env; set +a
python scripts/fetch_seed.py         # caches real FRED series to data/seed/ (git-ignored, stays local)
```

Jupyter + MCP:
```bash
pip install jupyter-collaboration      # lets the MCP edit the open notebook live (match Datalayer's pins if needed)
scripts/start-jupyter.sh               # loads .env, uses JUPYTER_TOKEN, opens the demo notebook
```
Always start Jupyter with this script: it gives the notebook kernel your `FRED_API_KEY` and keeps the
token in sync with `.mcp.json`. In Claude Code, `/mcp` should list `jupyter` as connected.

Go (stage 6 freshness check): `brew install go`.

Cloud:
- **Vertex AI**: enable Claude models in Model Garden for your project/region; `gcloud auth application-default login`.
- **Bedrock**: enable Claude model access in your region; `aws sso login --profile $AWS_PROFILE`.
- **GCS**: `gcloud storage buckets create gs://$GCS_BUCKET --location=us`.

Avoid the `/setup-vertex` and `/setup-bedrock` wizards: they write the provider into your user
settings and override the per-terminal personas. If Vertex quota isn't available yet, set
`DS_PROVIDER=bedrock` in `.env` and the `ds` persona runs on Bedrock instead.

## Running the demo
```bash
source scripts/personas.sh      # in each terminal
ds    # Data Science (Vertex)    swe   # SWE (Bedrock)    sre   # SRE (Bedrock)
```

## Hooks (team standards, enforced)
- `.claude/hooks/guard_secrets.py` (PreToolUse): blocks writing secrets or card numbers.
- `.claude/hooks/verify_on_stop.py` (Stop): Claude can't finish until the tests for what it changed
  pass (pytest / Vitest / go test, picked by changed paths). Wire it in `.claude/settings.json` under
  `"hooks"`, next to `"PreToolUse"`:
  ```json
  "Stop": [
    { "hooks": [ { "type": "command",
                   "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/verify_on_stop.py\"",
                   "timeout": 300 } ] }
  ]
  ```

## Stage commands
Each demo stage's prompt is a project command in `.claude/commands/`: `/acquire`, `/explore`,
`/fit-model`, `/fix-model`, `/graduate`, `/stress-panel`, `/incident`, `/incident-fix`. `scripts/update-checkpoints.sh` puts the latest
commands and reset script onto every checkpoint (commits marked `Tooling:`).

## Dashboard
```bash
bash scripts/start-dashboard.sh   # loads .env, installs on first run, opens http://localhost:5173
```

## Checkpoints (fallbacks)
| tag | state |
|---|---|
| `s1-start` | scaffold + dashboard shell; notebook has a title cell; no `risk_model/` |
| `s2-done` | DS stage complete: notebook, `risk_model/` package + tests, published artifacts |
| `s3-done` | SWE stage complete + production ops (nightly job, Go freshness check, runbook); stage 6 starts here |
| `s4-done` | SRE stage complete: silent seed fallback fixed, regression tests, runbook |

`scripts/demo-reset.sh [tag]` puts the repo on branch `demo-live` at that tag (main untouched),
keeps your downloaded `data/seed/`, and re-seeds the bucket from `data/seed/published/`. After a full dry run, copy
`data/published/*` into `data/seed/published/` so resets have known-good data (also git-ignored).

## Tests
```bash
python -m pytest -q
go test ./ops/freshness
cd dashboard && npm test
```

After pulling changes that complete a stage, run `bash scripts/update-checkpoints.sh --push` on `main`
to move the checkpoint tags (commits are marked `[checkpoint:<tag>]`).
