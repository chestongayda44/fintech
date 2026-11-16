#!/usr/bin/env bash
# Open a pull request for the stage 5 dashboard work (used by /ship).
#   bash scripts/open-pr.sh "Title"      # description is read from PR_BODY.md
# Pushes a base branch at the current commit, commits only dashboard/ on a feature branch on top,
# and opens a PR between them, so the PR shows just this stage's change.
# After rehearsals: bash scripts/cleanup-prs.sh
set -euo pipefail
cd "$(dirname "$0")/.."
title="${1:?usage: open-pr.sh \"title\"}"
body_file="PR_BODY.md"
[[ -f "$body_file" ]] || { echo "open-pr: write the description to $body_file first" >&2; exit 1; }
[[ -n "$(git status --porcelain dashboard)" ]] || { echo "open-pr: no dashboard changes to ship" >&2; exit 1; }

stamp="$(date +%Y%m%d-%H%M%S)"
base="demo/base-$stamp"
feat="demo/stress-panel-$stamp"

git push -q origin "HEAD:refs/heads/$base"
git switch -q -c "$feat"
git add dashboard
git commit -q -m "$title" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push -q -u origin "$feat"

repo_url="$(git remote get-url origin | sed -e 's#git@github.com:#https://github.com/#' -e 's#\.git$##')"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  gh pr create --base "$base" --head "$feat" --title "$title" --body-file "$body_file"
else
  echo "Pull request ready to open: $repo_url/compare/$base...$feat?expand=1"
fi
rm -f "$body_file"