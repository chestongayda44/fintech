#!/usr/bin/env bash
# Point the demo checkpoint tags at the right commits after a `git pull`.
#
#   git pull && scripts/update-checkpoints.sh          # retag locally
#   scripts/update-checkpoints.sh --push               # ...and push the tags to origin
#
# Commits that complete a stage carry a marker in their message, e.g. "[checkpoint:s3-done]".
# A commit may also carry "S1-Overlay: <paths>", meaning those paths belong in the demo's starting
# state too; they are copied onto s1-start as a new commit. Safe to run repeatedly.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local push=0
  [[ "${1:-}" == "--push" ]] && push=1

  if [[ "$(git branch --show-current)" != "main" ]]; then
    echo "Run this on main (git checkout main)." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Commit or stash your changes first." >&2
    exit 1
  fi

  local tag sha
  for tag in $(git log main --format=%B | grep -o '\[checkpoint:[a-z0-9-]*\]' | sed 's/\[checkpoint:\(.*\)\]/\1/' | sort -u); do
    sha="$(git log main -1 --format=%H --grep="\[checkpoint:$tag\]")"
    if [[ "$(git rev-parse -q --verify "refs/tags/$tag^{commit}" || true)" != "$sha" ]]; then
      git tag -f "$tag" "$sha" >/dev/null
      echo "$tag -> $(git log -1 --format='%h %s' "$sha")"
    else
      echo "$tag already at $(git rev-parse --short "$sha")"
    fi
  done

  # Overlay starting-state paths onto s1-start (oldest first, so later commits win).
  local overlays=()
  while read -r sha; do
    local paths
    paths="$(git log -1 --format=%B "$sha" | sed -n 's/^S1-Overlay: //p')"
    [[ -n "$paths" ]] && overlays+=("$sha:$paths")
  done < <(git log main --reverse --format=%H --grep='^S1-Overlay: ')

  if (( ${#overlays[@]} )) && git rev-parse -q --verify refs/tags/s1-start >/dev/null; then
    local entry src p
    git checkout -q --detach s1-start
    # Apply every overlay in order (later commits win), then commit only if the result differs.
    for entry in "${overlays[@]}"; do
      src="${entry%%:*}"
      for p in ${entry#*:}; do
        git checkout -q "$src" -- "$p"
      done
    done
    if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
      git commit -q -m "Starting state: overlay starting-state files from main"
      git tag -f s1-start >/dev/null
      echo "s1-start -> $(git log -1 --format='%h %s')"
    else
      echo "s1-start already up to date"
    fi
    git checkout -q main
  fi

  if (( push )); then
    git push --force origin --tags
  else
    echo "Tags updated locally. Push them with: git push --force origin --tags"
  fi
}

main "$@"
