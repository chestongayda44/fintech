#!/usr/bin/env python3
"""Write docs/DEMO_PROMPTS.md: the prompt behind each slash command, for the audience to read.

Open it in VS Code's Markdown preview (Cmd+Shift+V) next to the terminal. The prompt text is copied
from .claude/commands/*.md, so re-run this after editing a command:
    python3 scripts/build-demo-prompts.py
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMANDS = ROOT / ".claude" / "commands"
OUT = ROOT / "docs" / "DEMO_PROMPTS.md"

# Circle colours match each persona's banner colour in the terminal.
TEAMS = {
    "ds": "🟣 **Data Science**",
    "swe": "🔵 **Software Engineering**",
    "sre": "🟢 **Site Reliability**",
    "all": "**Every team**",
}

# command: prompt comes from .claude/commands/<command>.md. typed: text typed live.
# bold: phrases in the prompt to bold (the guardrails written into the request).
STEPS = [
    {"stage": "0", "title": "Guardrails, live", "team": "swe",
     "typed": ["What's in the .env file?",
               "Add a sample transaction with card number 4111 1111 1111 1111 to dashboard/src/test/fixtures/sample_txn.json so we can test masking."],
     "result": "Both refused: the first by the repo's permission rules, the second by a hook that scans every write for card numbers.",
     "dial": "Rules set by the team, enforced by the tool.",
     "security": "It can't read your secrets and can't write card data, whoever asks."},
    {"stage": "1", "command": "acquire", "team": "ds",
     "bold": ["key in the FRED_API_KEY env var", "justify the choice"],
     "dial": "Open: exploring in a notebook.",
     "security": "The API key is read from the environment; it never appears in the notebook or the chat."},
    {"stage": "2", "command": "explore", "team": "ds",
     "bold": ["at least 2 of 3"],
     "dial": "Open: exploring in a notebook.",
     "security": "The team's data rules live in CLAUDE.md, and every session follows them."},
    {"stage": "3", "command": "fit-model", "team": "ds",
     "bold": ["Sanity-check it before going further."],
     "dial": "Open, with a check built in.",
     "security": "Model risk: the model is challenged before anyone relies on it."},
    {"stage": "3", "command": "fix-model", "team": "ds",
     "bold": ["show how much that exclusion matters"],
     "dial": "Open, with a check built in.",
     "security": "Model risk: interpretable, documented and validated."},
    {"stage": "4", "command": "graduate", "team": "ds",
     "bold": ["so production doesn't depend on the notebook", "pytest tests"],
     "dial": "Tighter: production code; Claude can't finish until the tests pass.",
     "security": "Every write is scanned; data is published to your bucket under your IAM."},
    {"stage": "5", "command": "stress-panel", "team": "swe",
     "bold": ["Vitest tests proving the TypeScript matches"],
     "dial": "Tighter: a person approves the plan before any change.",
     "security": "Change control: the plan is approved and the diff is reviewable."},
    {"stage": "5", "command": "ship", "team": "swe",
     "bold": ["Don't run any other git or gh commands."],
     "dial": "Claude opens the pull request; a person reviews and merges.",
     "security": "It can open a PR but can't push to main or merge: those stay with your people and your CI."},
        {"stage": "6", "title": "The page", "team": "sre",
     "typed": ["bash scripts/simulate-incident.sh",
               "cd ~/Downloads/fintechco-prod && sre"],
     "result": "Production's nightly job quietly publishes stale data and still reports success. The dashboard drops back to 2025 Q4, and the freshness check pages.",
     "dial": "Production runs in its own checkout, separate from the teams' work.",
     "security": "The SRE agent in production has no shell: it can read code and logs, nothing more."},
    {"stage": "6", "command": "incident", "team": "sre",
     "bold": ["Use only file reads and searches", "don't change anything"],
     "dial": "Tightest: diagnosis is read-only.",
     "security": "Least privilege: it investigates production without being able to change it."},
    {"stage": "6", "title": "The fix goes in", "team": "sre",
     "typed": ["bash scripts/apply-fix.sh"],
     "result": "A person applies the team's reviewed fix; the nightly job re-runs, the freshness check passes, and the dashboard is back on the latest quarter.",
     "dial": "Tightest: a person applies the fix.",
     "security": "Claude proposed; a person decided."},
    {"stage": "6", "command": "sweep", "team": "sre",
     "bold": ["Don't change anything."],
     "dial": "Tightest: the reviewers can only read.",
     "security": "16 services checked for silent fallbacks, secrets in code, card data in logs and missing timeouts."},
    {"stage": "6", "title": "What it cost", "team": "all",
     "typed": ["python3 scripts/cost-report.py"],
     "result": "Model cost for the whole flow, per team. In your setup, the authoritative figure is in your AWS or GCP bill.",
     "dial": "Cost visible per session and per team.",
     "security": "Spend lands in your own cloud billing, under your budgets and alerts."}
]


def command_body(name: str) -> str:
    text = (COMMANDS / f"{name}.md").read_text()
    parts = text.split("---", 2)
    body = parts[2] if text.startswith("---") and len(parts) == 3 else text
    return "\n\n".join(" ".join(p.split()) for p in re.split(r"\n\s*\n", body.strip()) if p.strip())


def build() -> str:
    out = [
        "# What Claude is asked",
        "",
        "Each slash command typed in the terminal sends Claude the request shown under it.",
        "",
    ]
    for s in STEPS:
        out += ["---", ""]
        if "command" in s:
            out += [f"## {s['stage']} · `/{s['command']}`", "", TEAMS[s["team"]], ""]
            text = command_body(s["command"])
            for phrase in s.get("bold", []):
                text = text.replace(phrase, f"**{phrase}**", 1)
            out += ["> " + line if line else ">" for line in text.split("\n")]
        else:
            out += [f"## {s['stage']} · {s['title']}", "", TEAMS[s["team"]], ""]
            for t in s["typed"]:
                out += ["```", t, "```", ""]
            out += [f"**Result:** {s['result']}"]
        out += ["", f"**Supervision:** {s['dial']}  ", f"**Security:** {s['security']}", ""]
    return "\n".join(out)


if __name__ == "__main__":
    OUT.write_text(build())
    print(f"wrote {OUT.relative_to(ROOT)}")
