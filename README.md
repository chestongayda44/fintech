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
python scripts/fetch_seed.py         # caches real FRED series to data/seed/ — commit these
```

Jupyter + MCP (match the versions to the Datalayer docs for the server you installed):
```bash
jupyter lab --port 8888 --IdentityProvider.token "$JUPYTER_TOKEN"
```
`.mcp.json` registers the `jupyter` server for this project using `JUPYTER_URL` / `JUPYTER_TOKEN`
from your shell. In Claude Code, `/mcp` should list it as connected.

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

## Checkpoints (fallbacks)
| tag | state |
|---|---|
| `s1-start` | scaffold only; notebook has a title cell; no `risk_model/` |
| `s2-done` | DS stage complete: notebook, `risk_model/` package + tests, published artifacts |

`scripts/demo-reset.sh [tag]` puts the repo on branch `demo-live` at that tag (main untouched)
and re-seeds the bucket from `data/seed/published/`. After a full dry run, copy
`data/published/*` into `data/seed/published/` and commit so resets have known-good data.

## Tests
```bash
python -m pytest -q
```
