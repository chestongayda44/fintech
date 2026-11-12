#!/usr/bin/env bash
# Start the stress-test dashboard dev server with the demo environment.
#
#   scripts/start-dashboard.sh
#
# Loads .env so the dashboard reads the payload from the same place the pipeline publishes it
# (DATA_SOURCE=gcs -> the GCS bucket, otherwise data/published/). Leave it running during the
# demo: edits Claude makes in dashboard/ appear in the browser immediately.
set -euo pipefail
cd "$(dirname "$0")/.."

# A DATA_SOURCE given on the command line wins over .env (e.g. DATA_SOURCE=local bash scripts/start-dashboard.sh).
cli_source="${DATA_SOURCE:-}"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
if [[ -n "$cli_source" ]]; then export DATA_SOURCE="$cli_source"; fi

cd dashboard
if [[ ! -d node_modules ]]; then
  echo "Installing dashboard dependencies (first run only)..."
  npm install --no-audit --no-fund
fi
echo "Dashboard on http://localhost:5173 (payload from DATA_SOURCE=${DATA_SOURCE:-local})"
exec npm run dev -- --open
