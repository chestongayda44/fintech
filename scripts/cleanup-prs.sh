#!/usr/bin/env bash
# Close demo pull requests and delete demo/* branches on GitHub and locally (after rehearsals).
set -euo pipefail
cd "$(dirname "$0")/.."
for b in $(git ls-remote --heads origin 'refs/heads/demo/*' | sed 's#.*refs/heads/##'); do
  if [[ "$b" == demo/stress-panel-* ]] && command -v gh >/dev/null; then
    gh pr close "$b" >/dev/null 2>&1 || true
  fi
  git push -q origin --delete "$b" && echo "deleted $b"
done
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/demo/); do
  git branch -q -D "$b"
done