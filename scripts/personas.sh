#!/usr/bin/env bash
# Source this file in each demo terminal:   source scripts/personas.sh
# Then launch a persona:                    ds | swe | sre
#
# Each persona runs Claude Code against a different cloud provider so the
# audience sees both of FinTechCo's clouds in use:
#   ds  -> Google Vertex AI   (data science lives on GCP)
#   swe -> Amazon Bedrock
#   sre -> Amazon Bedrock
# Inside a session, run /status to show the active provider on screen.
#
# Every persona shows a status line with model, session cost, time and lines changed, and records
# totals for `python3 scripts/cost-report.py`.

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

if [[ -f "$_repo_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$_repo_root/.env"
  set +a
else
  echo "personas: no .env found at $_repo_root/.env (copy .env.example)" >&2
fi

# Run Claude in the current checkout if it's a worktree of this repo (e.g. ../fintechco-prod for
# stage 6), otherwise in the main demo folder.
_persona_dir() {
  local top common mine
  top="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "$_repo_root"; return; }
  common="$(cd "$top" && cd "$(git rev-parse --git-common-dir)" && pwd)"
  mine="$(cd "$_repo_root" && cd "$(git rev-parse --git-common-dir)" && pwd)"
  if [[ "$common" == "$mine" ]]; then echo "$top"; else echo "$_repo_root"; fi
}

_clear_providers() {
  unset CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_BEDROCK
}

_title() { printf '\033]0;%s\007' "$1"; }

# Launch Claude for a persona with the cost status line and the shared cost ledger.
# The status line comes in through --settings, so .claude/settings.json is untouched.
_launch() {
  local persona="$1"; shift
  export CLAUDE_PERSONA="$persona" COST_LEDGER_DIR="$_repo_root/.claude/cost-ledger"
  local sl
  sl="$(printf '{"statusLine":{"type":"command","command":"python3 %s/scripts/statusline.py"}}' "$_repo_root")"
  echo -e "\033[2m  cost so far: python3 scripts/cost-report.py\033[0m"
  (cd "$(_persona_dir)" && claude --settings "$sl" "$@")
}

ds() {
  _clear_providers
  # DS_PROVIDER=vertex (default) or bedrock — flip to bedrock if Vertex quota/access is unavailable.
  if [[ "${DS_PROVIDER:-vertex}" == "bedrock" ]]; then
    export CLAUDE_CODE_USE_BEDROCK=1
    : "${AWS_REGION:?set AWS_REGION in .env}"
    _title "Data Science · Claude via Bedrock"
    echo -e "\033[1;35m▶ Data Science — Claude Code via Amazon Bedrock ($AWS_REGION)\033[0m"
  else
    export CLAUDE_CODE_USE_VERTEX=1
    : "${ANTHROPIC_VERTEX_PROJECT_ID:?set ANTHROPIC_VERTEX_PROJECT_ID in .env}"
    : "${CLOUD_ML_REGION:?set CLOUD_ML_REGION in .env}"
    _title "Data Science · Claude via Vertex AI"
    echo -e "\033[1;35m▶ Data Science — Claude Code via Google Vertex AI ($CLOUD_ML_REGION)\033[0m"
  fi
  _launch ds "$@"
}

swe() {
  _clear_providers
  export CLAUDE_CODE_USE_BEDROCK=1
  : "${AWS_REGION:?set AWS_REGION in .env}"
  _title "Software Engineering · Claude via Bedrock"
  echo -e "\033[1;34m▶ Software Engineering — Claude Code via Amazon Bedrock ($AWS_REGION)\033[0m"
  _launch swe "$@"
}

sre() {
  _clear_providers
  export CLAUDE_CODE_USE_BEDROCK=1
  : "${AWS_REGION:?set AWS_REGION in .env}"
  _title "SRE · Claude via Bedrock"
  echo -e "\033[1;32m▶ SRE — Claude Code via Amazon Bedrock ($AWS_REGION)\033[0m"
  _launch sre "$@"
}
