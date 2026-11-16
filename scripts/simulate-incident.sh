#!/usr/bin/env bash
# Stage 6 setup: "three weeks later, the freshness check pages SRE at 2 a.m."
# Run it BEFORE stage 6, off-screen. It prints one line when it's ready (or what's wrong).
#
#   bash scripts/simulate-incident.sh          # quiet
#   bash scripts/simulate-incident.sh -v       # show each step
#   PROD_DIR=/some/path bash scripts/simulate-incident.sh
#
# Your demo folder is NOT touched: everything you built live in stages 1-5 stays as it is.
# Production is a separate git worktree of this repo at s3-done (model, dashboard, nightly job,
# freshness check as shipped) at ../fintechco-prod. It publishes to the same place the dashboard
# reads (the GCS bucket, or this folder's data/published via a link), so the stale data shows up.
#
# 1. Creates (or recreates) the production worktree at s3-done.
# 2. Recreates production's fallback cache: a FRED snapshot from when the pipeline was built
#    (data through 2025 Q4).
# 3. Runs the nightly job as production runs it after a key rotation: no FRED_API_KEY. It quietly
#    falls back to the old cache, publishes, and reports success.
# 4. Runs the freshness check, which pages. The alert is saved to ops/logs/alert.txt in production.
set -euo pipefail

VERBOSE=0
say() { if (( VERBOSE )); then echo "$@"; fi; }
fail() { echo "Couldn't stage the incident: $*" >&2; exit 1; }

main() {
  if [[ "${1:-}" == "-v" ]]; then VERBOSE=1; fi
  cd "$(dirname "$0")/.."
  local root prod
  root="$(pwd)"
  prod="${PROD_DIR:-$(cd "$root/.." && pwd)/fintechco-prod}"

  # Preflight: everything the incident needs, checked before touching anything.
  compgen -G "data/seed/*.csv" >/dev/null || fail "no FRED data in data/seed/. Run: python scripts/fetch_seed.py"
  command -v go >/dev/null || fail "Go isn't installed (the freshness check is Go). Run: brew install go"
  git rev-parse -q --verify refs/tags/s3-done >/dev/null || fail "no s3-done checkpoint. Run: bash scripts/update-checkpoints.sh"
  if [[ -f .env ]]; then set -a; source .env; set +a; fi
  # The pipeline needs a Python with its packages; pick one that has them (PYTHON in .env wins).
  if [[ -z "${PYTHON:-}" ]]; then
    local candidate
    for candidate in python python3; do
      if command -v "$candidate" >/dev/null && "$candidate" -c "import pandas, statsmodels" 2>/dev/null; then
        PYTHON="$(command -v "$candidate")"; break
      fi
    done
  fi
  [[ -n "${PYTHON:-}" ]] && "$PYTHON" -c "import pandas, statsmodels" 2>/dev/null \
    || fail "no Python with the pipeline's packages. Run: pip install -r requirements.txt, then add PYTHON=\$(which python) to .env"
  export PYTHON
  if [[ "${DATA_SOURCE:-local}" == "gcs" ]]; then
    [[ -n "${GCS_BUCKET:-}" ]] || fail "DATA_SOURCE=gcs but GCS_BUCKET is empty in .env"
    gcloud storage ls "gs://$GCS_BUCKET" >/dev/null 2>&1 \
      || fail "can't reach gs://$GCS_BUCKET (does the bucket exist? is gcloud logged in?). Create it, or run with DATA_SOURCE=local"
  fi

  # 1. Production checkout (a git worktree), recreated fresh each time.
  git worktree prune
  if [[ -e "$prod" ]]; then
    git worktree list --porcelain | grep -qx "worktree $prod" \
      || fail "$prod exists and isn't a worktree of this repo; set PROD_DIR to another path"
    git worktree remove --force "$prod"
  fi
  say "Creating the production checkout at $prod (s3-done)..."
  git worktree add -q -f -B prod-incident "$prod" s3-done >/dev/null 2>&1

  # Same environment, data and Claude approvals as the demo folder; same publish target.
  if [[ -f .env ]]; then cp .env "$prod/.env"; fi
  if ! grep -q '^PYTHON=..*' "$prod/.env" 2>/dev/null; then
    { grep -v '^PYTHON=' "$prod/.env" 2>/dev/null || true; echo "PYTHON=$PYTHON"; } > "$prod/.env.tmp" && mv "$prod/.env.tmp" "$prod/.env"
  fi
  if [[ -f .claude/settings.local.json ]]; then cp .claude/settings.local.json "$prod/.claude/settings.local.json"; fi
  mkdir -p "$prod/data/seed" data/published
  cp data/seed/*.csv "$prod/data/seed/"
  rm -rf "$prod/data/published"
  ln -s "$root/data/published" "$prod/data/published"
  cd "$prod"

  # 2. Production's fallback cache: the snapshot taken when the pipeline was set up (through 2025 Q4).
  rm -rf ops/.prod-cache ops/logs && mkdir -p ops/.prod-cache ops/logs
  "$PYTHON" - "$prod" <<'PY'
import csv, pathlib, sys
root = pathlib.Path(sys.argv[1])
for src in sorted((root / "data" / "seed").glob("*.csv")):
    with src.open() as fh:
        rows = [r for r in csv.reader(fh)]
    keep = [rows[0]] + [r for r in rows[1:] if r[0] <= "2025-12-31"]
    with (root / "ops" / ".prod-cache" / src.name).open("w", newline="") as fh:
        csv.writer(fh).writerows(keep)
PY

  # 3. The nightly job, as production runs it after the key rotation. It must "succeed".
  say "Running the nightly job as production does (no FRED_API_KEY after the rotation)..."
  local rc=0 log
  env -u FRED_API_KEY RISK_MODEL_SEED_DIR="$prod/ops/.prod-cache" bash ops/ingest.sh >/dev/null 2>&1 || rc=$?
  log="$(ls -t ops/logs/ingest-*.log 2>/dev/null | head -1)"
  if (( rc != 0 )); then
    fail "the nightly job failed instead of quietly succeeding (exit $rc). Last lines of $prod/$log:
$(tail -3 "$log" 2>/dev/null)"
  fi
  cp "$log" ops/logs/ingest-latest.log   # fixed name, so /incident can read it without running ls
  say "  nightly job exit code: 0 (log: $log)"

  # 4. Monitoring: the freshness check must page.
  say "Running the freshness check..."
  mkdir -p ops/.bin && go build -o ops/.bin/freshness ./ops/freshness
  local check=0
  ops/.bin/freshness > ops/logs/alert.txt 2>&1 || check=$?
  if (( check != 2 )); then
    fail "the freshness check didn't page (exit $check):
$(cat ops/logs/alert.txt)"
  fi
  if (( VERBOSE )); then cat ops/logs/alert.txt; fi

  if ! grep -q '^PYTHON=..*' "$root/.env" 2>/dev/null; then
    echo "Note: add PYTHON=$PYTHON to .env so Claude's re-run of the job uses the same Python."
  fi
  echo "Incident staged in ../$(basename "$prod") (demo folder untouched). On stage: cat ../$(basename "$prod")/ops/logs/alert.txt, reload the dashboard, then cd ../$(basename "$prod") && sre and type /incident."
}

main "$@"
