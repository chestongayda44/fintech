#!/usr/bin/env bash
# Stage 6 setup: "three weeks later, the freshness check pages SRE at 2 a.m."
#
#   bash scripts/simulate-incident.sh            # production checkout at ../fintechco-prod
#   PROD_DIR=/some/path bash scripts/simulate-incident.sh
#
# Your demo folder is NOT touched: everything you built live in stages 1-5 stays as it is.
# Production is a separate git worktree of this repo at s3-done (model, dashboard, nightly job,
# freshness check as shipped). It publishes to the same place the dashboard reads (the GCS bucket,
# or this folder's data/published via a link), so the stale data shows up on screen.
#
# 1. Creates (or recreates) the production worktree at s3-done.
# 2. Recreates production's fallback cache: a FRED snapshot from when the pipeline was built
#    (data through 2025 Q4).
# 3. Runs the nightly job as production runs it after a key rotation: no FRED_API_KEY. It quietly
#    falls back to the old cache, publishes, and reports success.
# 4. Runs the freshness check, which pages. The alert is saved to ops/logs/alert.txt in production.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local root prod
  root="$(pwd)"
  prod="${PROD_DIR:-$(cd "$root/.." && pwd)/fintechco-prod}"

  if ! compgen -G "data/seed/*.csv" >/dev/null; then
    echo "No data/seed/*.csv; run: python scripts/fetch_seed.py" >&2
    exit 1
  fi
  if ! command -v go >/dev/null; then
    echo "Go is needed for the freshness check: brew install go" >&2
    exit 1
  fi
  if ! git rev-parse -q --verify refs/tags/s3-done >/dev/null; then
    echo "No s3-done checkpoint; run: bash scripts/update-checkpoints.sh" >&2
    exit 1
  fi

  # 1. Production checkout (a git worktree), recreated fresh each time.
  git worktree prune
  if [[ -e "$prod" ]]; then
    if git worktree list --porcelain | grep -qx "worktree $prod"; then
      git worktree remove --force "$prod"
    else
      echo "$prod exists and isn't a worktree of this repo; set PROD_DIR to another path." >&2
      exit 1
    fi
  fi
  echo "Creating the production checkout at $prod (s3-done)..."
  git worktree add -q -f -B prod-incident "$prod" s3-done

  # Same environment, data and Claude approvals as the demo folder; same publish target.
  if [[ -f .env ]]; then cp .env "$prod/.env"; fi
  if [[ -f .claude/settings.local.json ]]; then cp .claude/settings.local.json "$prod/.claude/settings.local.json"; fi
  mkdir -p "$prod/data/seed" data/published
  cp data/seed/*.csv "$prod/data/seed/"
  rm -rf "$prod/data/published"
  ln -s "$root/data/published" "$prod/data/published"

  cd "$prod"
  if [[ -f .env ]]; then set -a; source .env; set +a; fi

  # 2. Production's fallback cache: the snapshot taken when the pipeline was set up (through 2025 Q4).
  rm -rf ops/.prod-cache ops/logs && mkdir -p ops/.prod-cache ops/logs
  "${PYTHON:-python3}" - "$prod" <<'PY'
import csv, pathlib, sys
root = pathlib.Path(sys.argv[1])
for src in sorted((root / "data" / "seed").glob("*.csv")):
    with src.open() as fh:
        rows = [r for r in csv.reader(fh)]
    keep = [rows[0]] + [r for r in rows[1:] if r[0] <= "2025-12-31"]
    with (root / "ops" / ".prod-cache" / src.name).open("w", newline="") as fh:
        csv.writer(fh).writerows(keep)
PY

  # 3. The nightly job, as production runs it after the key rotation.
  echo "Running the nightly job as production does (no FRED_API_KEY after the rotation)..."
  local rc=0
  env -u FRED_API_KEY RISK_MODEL_SEED_DIR="$prod/ops/.prod-cache" bash ops/ingest.sh >/dev/null 2>&1 || rc=$?
  echo "  nightly job exit code: $rc   (log: $(ls -t ops/logs/ingest-*.log | head -1))"

  # 4. Monitoring.
  echo "Running the freshness check..."
  echo
  mkdir -p ops/.bin && go build -o ops/.bin/freshness ./ops/freshness
  ops/.bin/freshness | tee ops/logs/alert.txt || true
  echo
  echo "Reload the dashboard: it now shows stale data that looks normal."
  echo "Then, in the sre terminal:  cd $prod && sre   and type /incident"
  echo "(Your demo folder $root is untouched.)"
}

main "$@"
