#!/usr/bin/env bash
# Stage 6, step 4: put production on the merged fix (s4-done), re-run the nightly job, re-check.
# Run from the production checkout (../fintechco-prod), e.g. in Claude Code: ! bash scripts/apply-fix.sh
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  # Production only: this resets the checkout. In the demo folder it would wipe the live demo work.
  if [[ "$(git rev-parse --git-dir)" == "$(git rev-parse --git-common-dir)" ]]; then
    echo "apply-fix: run this in the production checkout, not the demo folder:" >&2
    echo "  cd ../fintechco-prod && bash scripts/apply-fix.sh" >&2
    exit 1
  fi
  # Works from a plain terminal tab: production's .env has the FRED key, PYTHON and DATA_SOURCE.
  if [[ -f .env ]]; then set -a; source .env; set +a; fi
  git reset -q --hard s4-done
  local fix
  fix="$(git log -1 --format=%H --grep='\[checkpoint:s4-done\]' s4-done)"
  echo "Merged fix: $(git log -1 --format=%s "$fix" | sed 's/ \[checkpoint:s4-done\]//')"
  git diff --stat "$fix^" "$fix" | sed 's/^/  /'
  echo
  echo "Re-running the nightly job..."
  bash ops/ingest.sh 2>&1 | grep -E "data source|ERROR|ingest finished" | sed 's/^/  /' || true
  echo
  ops/.bin/freshness || true
}

main "$@"
