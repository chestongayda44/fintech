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

_repo_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"

if [[ -f "$_repo_root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$_repo_root/.env"
  set +a
else
  echo "personas: no .env found at $_repo_root/.env (copy .env.example)" >&2
fi

_clear_providers() {
  unset CLAUDE_CODE_USE_VERTEX CLAUDE_CODE_USE_BEDROCK
}

_title() { printf '\033]0;%s\007' "$1"; }

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
  (cd "$_repo_root" && claude "$@")
}

swe() {
  _clear_providers
  export CLAUDE_CODE_USE_BEDROCK=1
  : "${AWS_REGION:?set AWS_REGION in .env}"
  _title "Software Engineering · Claude via Bedrock"
  echo -e "\033[1;34m▶ Software Engineering — Claude Code via Amazon Bedrock ($AWS_REGION)\033[0m"
  (cd "$_repo_root" && claude "$@")
}

sre() {
  _clear_providers
  export CLAUDE_CODE_USE_BEDROCK=1
  : "${AWS_REGION:?set AWS_REGION in .env}"
  _title "SRE · Claude via Bedrock"
  echo -e "\033[1;32m▶ SRE — Claude Code via Amazon Bedrock ($AWS_REGION)\033[0m"
  (cd "$_repo_root" && claude "$@")
}
