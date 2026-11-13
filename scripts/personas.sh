#!/usr/bin/env bash
# Source this file in each demo terminal:   source scripts/personas.sh
# Then launch a persona:                    ds | swe | sre
#
# Each persona runs on the provider set in .env (DS_PROVIDER / SWE_PROVIDER / SRE_PROVIDER):
#   anthropic (default), vertex or bedrock.
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

# Sets the model provider for a persona: anthropic (default), vertex or bedrock.
#   anthropic: your Claude Pro sign-in, or Console credits when USE_CREDITS=1 in .env
_provider_env() {
  case "$1" in
    vertex)
      : "${ANTHROPIC_VERTEX_PROJECT_ID:?set ANTHROPIC_VERTEX_PROJECT_ID in .env}"
      export CLAUDE_CODE_USE_VERTEX=1
      _PROVIDER_NAME="Google Vertex AI (${CLOUD_ML_REGION:-global})" ;;
    bedrock)
      : "${AWS_REGION:?set AWS_REGION in .env}"
      export CLAUDE_CODE_USE_BEDROCK=1
      _PROVIDER_NAME="Amazon Bedrock ($AWS_REGION)" ;;
    *)
      if [[ "${USE_CREDITS:-0}" == "1" ]]; then
        export ANTHROPIC_API_KEY="$CONSOLE_API_KEY"
        _PROVIDER_NAME="Anthropic API (credits)"
      else
        unset ANTHROPIC_API_KEY
        _PROVIDER_NAME="Anthropic API (Pro subscription)"
      fi ;;
  esac
  _title "$2 · Claude via $_PROVIDER_NAME"
}

ds() {
  _clear_providers
  _provider_env "${DS_PROVIDER:-anthropic}" "Data Science"
  echo -e "\033[1;35m▶ Data Science — Claude Code via $_PROVIDER_NAME\033[0m"
  _launch ds "$@"
}

swe() {
  _clear_providers
  _provider_env "${SWE_PROVIDER:-anthropic}" "Software Engineering"
  echo -e "\033[1;34m▶ Software Engineering — Claude Code via $_PROVIDER_NAME\033[0m"
  _launch swe "$@"
}

sre() {
  _clear_providers
  _provider_env "${SRE_PROVIDER:-anthropic}" "SRE"
  echo -e "\033[1;32m▶ SRE — Claude Code via $_PROVIDER_NAME\033[0m"
  _launch sre --disallowedTools Bash "$@"
}

# Connection checks: open Claude Code on a customer cloud to show /status on stage.
# Bedrock uses a model this AWS account can call (override with BEDROCK_MODEL in .env).
bedrock() {
  _clear_providers
  _provider_env bedrock "Bedrock check"
  echo -e "\033[1;33m▶ Claude Code via $_PROVIDER_NAME: type /status to show the connection\033[0m"
  _launch aws --model "${BEDROCK_MODEL:-us.anthropic.claude-haiku-4-5-20251001-v1:0}" "$@"
}

vertex() {
  _clear_providers
  _provider_env vertex "Vertex check"
  echo -e "\033[1;33m▶ Claude Code via $_PROVIDER_NAME: type /status to show the connection\033[0m"
  local args=()
  if [[ -n "${VERTEX_MODEL:-}" ]]; then args=(--model "$VERTEX_MODEL"); fi
  _launch gcp "${args[@]}" "$@"
}

# Stage 5: Software Engineering in plan mode. Claude must present a plan and get approval before
# changing anything.
swe-plan() {
  swe --permission-mode plan "$@"
}

# Jump to a checkpoint in one step: stops JupyterLab, resets, restarts JupyterLab in the background.
#   jump            -> start of the demo (s1-start)
#   jump s2-done    -> ready for /graduate      jump s3-done -> ready for the dashboard
jump() {
  local target="${1:-s1-start}"
  pkill -f "jupyter-lab|jupyter lab" 2>/dev/null && sleep 2
  (cd "$_repo_root" && FORCE=1 scripts/demo-reset.sh "$target") || return 1
  (cd "$_repo_root" && nohup scripts/start-jupyter.sh > /tmp/jupyter-demo.log 2>&1 &)
  sleep 3
    echo -e "\033[1;33m▶ At $target. JupyterLab restarted: use its new browser tab (close the old one).\033[0m"
}
