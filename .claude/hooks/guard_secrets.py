#!/usr/bin/env python3
"""PreToolUse hook: block writes that contain secrets or card numbers.

Claude Code passes the pending tool call as JSON on stdin. Exit code 2 blocks
the call and feeds stderr back to Claude so it can fix the content.

Checks:
  * Primary account numbers (13-19 digits, Luhn-valid, optional spaces/dashes)
  * AWS access key IDs
  * Google API keys
  * Literal assignment of a FRED-style key (32 lowercase alphanumeric chars)
"""
from __future__ import annotations

import json
import re
import sys

PAN_CANDIDATE = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")
SECRET_PATTERNS = {
    "AWS access key ID": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "Google API key": re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b"),
    "FRED API key literal": re.compile(
        r"(?i)(fred[_\-]?api[_\-]?key|api_key)\s*[:=]\s*['\"][0-9a-z]{32}['\"]"
    ),
}


def luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def find_problems(text: str) -> list[str]:
    problems: list[str] = []
    for name, pattern in SECRET_PATTERNS.items():
        if pattern.search(text):
            problems.append(name)
    for match in PAN_CANDIDATE.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and luhn_ok(digits) and len(set(digits)) > 1:
            problems.append("possible card number (PAN)")
            break
    return problems


def collect_text(tool_input: dict) -> str:
    parts: list[str] = []
    for key in ("content", "new_string", "new_source"):
        value = tool_input.get(key)
        if isinstance(value, str):
            parts.append(value)
    for edit in tool_input.get("edits", []) or []:
        if isinstance(edit, dict) and isinstance(edit.get("new_string"), str):
            parts.append(edit["new_string"])
    return "\n".join(parts)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # never block on malformed hook input
    text = collect_text(payload.get("tool_input", {}) or {})
    problems = find_problems(text)
    if problems:
        path = (payload.get("tool_input") or {}).get("file_path", "<unknown>")
        print(
            f"Blocked by FinTechCo guardrail: {', '.join(problems)} detected in write to {path}. "
            "Read secrets from environment variables and never write card numbers; "
            "use masked or synthetic values instead.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
