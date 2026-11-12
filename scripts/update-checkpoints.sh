#!/usr/bin/env bash
# Point the demo checkpoint tags at the right commits after a `git pull`.
#
#   git pull && bash scripts/update-checkpoints.sh          # retag locally
#   bash scripts/update-checkpoints.sh --push               # ...and push the tags to origin
#
# Commit message conventions on main:
#   [checkpoint:<tag>]      this commit completes a stage; <tag> points here
#   S1-Overlay: <paths>     these paths also belong in the demo's starting state (s1-start)
#   Tooling: <paths>        presenter tooling (reset script, stage commands): copied onto EVERY
#                           checkpoint, so whatever checkpoint you're on runs the latest tooling
# Overlays are applied in commit order (later commits win) as a small commit on top of the
# checkpoint. Safe to run repeatedly: nothing changes if the tags are already right.
set -euo pipefail

collect() { # $1 = trailer name -> lines "sha:paths", oldest first
  local sha paths
  while read -r sha; do
    paths="$(git log -1 --format=%B "$sha" | sed -n "s/^$1: //p")"
    if [[ -n "$paths" ]]; then echo "$sha:$paths"; fi
  done < <(git log main --reverse --format=%H --grep="^$1: ")
}

# overlay_checkpoint <tag> <base-commit> [overlay lines...]
overlay_checkpoint() {
  local tag="$1" base="$2"; shift 2
  local entry src p tree current=""
  current="$(git rev-parse -q --verify "refs/tags/$tag^{commit}" || true)"
  git checkout -q --detach "$base"
  for entry in "$@"; do
    src="${entry%%:*}"
    for p in ${entry#*:}; do git checkout -q "$src" -- "$p"; done
  done
  tree="$(git write-tree)"
  if [[ "$tree" == "$(git rev-parse "$base^{tree}")" ]]; then
    # No overlay needed: the checkpoint is the base commit itself.
    if [[ "$current" != "$base" ]]; then
      git tag -f "$tag" "$base" >/dev/null; echo "$tag -> $(git log -1 --format='%h %s' "$base")"
    else
      echo "$tag up to date"
    fi
  elif [[ -n "$current" && "$(git rev-parse "$current^{tree}")" == "$tree" ]] \
       && [[ "$current" == "$base" || "$(git rev-parse -q --verify "$current~1" || true)" == "$base" ]]; then
    echo "$tag up to date"
  else
    git commit -q -m "Checkpoint $tag: latest starting-state files and presenter tooling from main"
    git tag -f "$tag" >/dev/null
    echo "$tag -> $(git log -1 --format='%h %s')"
  fi
  git reset -q --hard
  git checkout -q main
}

main() {
  cd "$(dirname "$0")/.."
  local push=0
  if [[ "${1:-}" == "--push" ]]; then push=1; fi

  if [[ "$(git branch --show-current)" != "main" ]]; then
    echo "Run this on main (git checkout main)." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Commit or stash your changes first." >&2
    exit 1
  fi

  local s1_overlays=() tooling=() line tag sha
  while read -r line; do if [[ -n "$line" ]]; then s1_overlays+=("$line"); fi; done < <(collect "S1-Overlay")
  while read -r line; do if [[ -n "$line" ]]; then tooling+=("$line"); fi; done < <(collect "Tooling")

  # Starting state: overlays accumulate on the current s1-start.
  if git rev-parse -q --verify refs/tags/s1-start >/dev/null; then
    overlay_checkpoint s1-start "$(git rev-parse 's1-start^{commit}')" ${s1_overlays[@]+"${s1_overlays[@]}"} ${tooling[@]+"${tooling[@]}"}
  fi

  # Stage checkpoints: the marked commit, plus the latest tooling.
  for tag in $(git log main --format=%B | grep -o '\[checkpoint:[a-z0-9-]*\]' | sed 's/\[checkpoint:\(.*\)\]/\1/' | sort -u); do
    sha="$(git log main -1 --format=%H --grep="\[checkpoint:$tag\]")"
    overlay_checkpoint "$tag" "$sha" ${tooling[@]+"${tooling[@]}"}
  done

  if (( push )); then
    git push --force origin --tags
  else
    echo "Tags updated locally. Push them with: git push --force origin --tags"
  fi
}

main "$@"
