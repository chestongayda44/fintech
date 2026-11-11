#!/usr/bin/env bash
# Reset the repo to the starting state of a demo stage.
#
#   scripts/demo-reset.sh            # reset to s1-start (beginning of the demo)
#   scripts/demo-reset.sh s2-done    # jump to a checkpoint (fallback mid-demo)
#
# Works on a throwaway branch called `demo-live`, so main is never touched.
# Ignored files (.env, data/seed, node_modules) are preserved.
set -euo pipefail

TARGET="${1:-s1-start}"
cd "$(dirname "$0")/.."

if ! git rev-parse -q --verify "refs/tags/$TARGET" >/dev/null; then
  echo "Unknown checkpoint '$TARGET'. Available:" >&2
  git tag -l 's*' >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" && "${FORCE:-0}" != "1" ]]; then
  read -r -p "Uncommitted changes will be discarded. Continue? [y/N] " ok
  [[ "$ok" == "y" || "$ok" == "Y" ]] || exit 1
fi

git checkout -q -B demo-live "$TARGET"
git reset -q --hard "$TARGET"
git clean -q -fd   # removes untracked files but keeps git-ignored ones (.env, seed cache)

# Restore the known-good dataset in the bucket so later stages always have data.
if [[ -f .env ]]; then set -a; source .env; set +a; fi
if [[ "${DATA_SOURCE:-local}" == "gcs" && -n "${GCS_BUCKET:-}" ]] && command -v gcloud >/dev/null; then
  if compgen -G "data/seed/published/*" >/dev/null; then
    gcloud storage cp -q data/seed/published/* "gs://$GCS_BUCKET/${GCS_PREFIX:-macro-credit-risk}/" \
      && echo "Bucket re-seeded from data/seed/published/"
  fi
fi

echo "Reset to $TARGET on branch demo-live."
echo "Reminder: in JupyterLab, File > Reload Notebook from Disk, and restart the kernel."
