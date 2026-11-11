#!/usr/bin/env bash
# Start JupyterLab for the demo with the right environment and token.
#
#   scripts/start-jupyter.sh
#
# - Loads .env so the notebook kernel can see FRED_API_KEY (live FRED calls)
# - Uses JUPYTER_TOKEN from .env, so the Jupyter MCP server and JupyterLab always agree
# - Serves from the repo root, so paths like notebooks/macro_credit_risk.ipynb resolve for the MCP
# - Opens the demo notebook directly
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "No .env found. Copy .env.example to .env and fill it in." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${JUPYTER_TOKEN:-}" ]]; then
  echo "JUPYTER_TOKEN is empty in .env. Generate one with:" >&2
  echo "  python -c \"import secrets; print(secrets.token_hex(16))\"" >&2
  exit 1
fi
if [[ -z "${FRED_API_KEY:-}" ]]; then
  echo "Warning: FRED_API_KEY is empty; the notebook will fall back to data/seed/." >&2
fi
if ! compgen -G "data/seed/*.csv" >/dev/null; then
  echo "Warning: no data/seed/*.csv found; run: python scripts/fetch_seed.py" >&2
fi

URL="${JUPYTER_URL:-http://localhost:8888}"
PORT="${URL##*:}"
PORT="${PORT%%/*}"

echo "JupyterLab on $URL (token from .env), root: $(pwd)"
exec jupyter lab \
  --port "$PORT" \
  --IdentityProvider.token "$JUPYTER_TOKEN" \
  --ServerApp.root_dir "$(pwd)" \
  notebooks/macro_credit_risk.ipynb
