#!/usr/bin/env bash
# Reset the repo to the starting state of a demo stage.
#
#   scripts/demo-reset.sh            # reset to s1-start (beginning of the demo)
#   scripts/demo-reset.sh s2-done    # jump to a checkpoint (fallback mid-demo)
#
# Works on a throwaway branch called `demo-live`, so main is never touched.
# Keeps .env and your downloaded FRED data (data/seed/) across resets.
set -euo pipefail

# Everything lives in main(), which bash parses in full before running. That matters because
# this script checks out another commit, which can rewrite this very file mid-run.
main() {
  local target="${1:-s1-start}"
  cd "$(dirname "$0")/.."

  if ! git rev-parse -q --verify "refs/tags/$target" >/dev/null; then
    echo "Unknown checkpoint '$target'. Available:" >&2
    git tag -l 's*' >&2
    exit 1
  fi

  if [[ -n "$(git status --porcelain --untracked-files=no)" && "${FORCE:-0}" != "1" ]]; then
    read -r -p "Uncommitted changes to tracked files will be discarded. Continue? [y/N] " ok
    [[ "$ok" == "y" || "$ok" == "Y" ]] || exit 1
  fi

  # Preserve downloaded data: checkout/clean would otherwise delete it.
  local keep
  keep="$(mktemp -d)"
  if [[ -d data/seed ]]; then cp -R data/seed "$keep/seed"; fi

  git checkout -q -f -B demo-live "$target"
  git reset -q --hard "$target"
  git clean -q -fd   # removes untracked files; git-ignored ones (.env, data/published) stay

  if [[ -d "$keep/seed" ]]; then
    mkdir -p data/seed
    cp -R "$keep/seed/." data/seed/
  fi
  rm -rf "$keep"


  # Restore the known-good dataset in the bucket so later stages always have data.
  if [[ -f .env ]]; then set -a; source .env; set +a; fi
  if [[ "${DATA_SOURCE:-local}" == "gcs" && -n "${GCS_BUCKET:-}" ]] && command -v gcloud >/dev/null; then
    if compgen -G "data/seed/published/*" >/dev/null; then
      gcloud storage cp -q data/seed/published/* "gs://$GCS_BUCKET/${GCS_PREFIX:-macro-credit-risk}/" \
        && echo "Bucket re-seeded from data/seed/published/"
    fi
  fi

  echo "Reset to $target on branch demo-live (data/seed preserved)."
  echo "In JupyterLab: File > Reload Notebook from Disk, then Kernel > Restart."
  echo "(Note: a stage's working files show up as untracked changes; that's expected.)"
}

main "$@"
