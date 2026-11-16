#!/usr/bin/env python3
"""Stop hook: Claude can't finish a task until the tests for what it changed pass.

Claude Code runs this when Claude is about to end its turn. It looks at the uncommitted changes,
picks the matching test suites, and runs them:

    risk_model/, tests/, *.py        -> python -m pytest -q
    dashboard/src/                   -> npm test (Vitest)
    ops/freshness/, *.go             -> go test ./ops/freshness

All green: Claude finishes, and a one-line "tests passed" message is shown.
Any failure: Claude is blocked from finishing and gets the failure output, so it fixes the code
and tries again. To avoid an endless loop it blocks at most MAX_BLOCKS times per session, then
lets Claude finish with a visible warning.

Notebook-only work (stages 1-3) changes nothing testable, so the hook stays silent.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

MAX_BLOCKS = 2
TIMEOUT_S = 180
TAIL_LINES = 40


def changed_files(root: Path) -> list[str]:
    """Uncommitted changes: modified, staged and untracked files."""
    out = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=root, capture_output=True, text=True, check=False,
    ).stdout
    files = []
    for line in out.splitlines():
        path = line[3:].split(" -> ")[-1].strip().strip('"')
        if path:
            files.append(path)
    return files


def find_python() -> str | None:
    """A Python that can run the project's tests (pytest + pandas + statsmodels installed).

    Tries $PYTHON (from .env), the active conda/venv, then `python` and `python3` on PATH. A machine
    can have several Pythons (e.g. Homebrew's next to conda); only one has the project's packages.
    """
    candidates = [os.environ.get("PYTHON")]
    for env in ("CONDA_PREFIX", "VIRTUAL_ENV"):
        if os.environ.get(env):
            candidates.append(str(Path(os.environ[env]) / "bin" / "python"))
    candidates += [shutil.which("python"), shutil.which("python3"), sys.executable]
    seen: set[str] = set()
    for c in candidates:
        if not c or c in seen:
            continue
        seen.add(c)
        try:
            ok = subprocess.run([c, "-c", "import pytest, pandas, statsmodels"],
                                capture_output=True, timeout=30, check=False).returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            ok = False
        if ok:
            return c
    return None


def suites_for(files: list[str], root: Path) -> list[tuple[str, list[str], Path]]:
    """(name, command, cwd) for each suite the changes touch."""
    suites: list[tuple[str, list[str], Path]] = []
    if any(f.endswith(".py") and not f.startswith((".claude/", "notebooks/", "scripts/")) for f in files):
        python = find_python()
        if python is None:
            # No Python with the test packages: a setup problem, not Claude's code. Don't block on it.
            emit({"systemMessage": "Stop hook: no Python with pytest/pandas/statsmodels found; set PYTHON "
                                   "in .env to the interpreter that has them. Tests not run."})
        suites.append(("Python", [python, "-m", "pytest", "-q", "-x", "-p", "no:cacheprovider"], root))
    if any(f.startswith("dashboard/src/") for f in files) and (root / "dashboard" / "node_modules").is_dir():
        suites.append(("Dashboard", ["npm", "test", "--silent"], root / "dashboard"))
    if any(f.startswith("ops/freshness/") for f in files):
        suites.append(("Go", ["go", "test", "./ops/freshness"], root))
    return suites


def block_count_file(session_id: str) -> Path:
    return Path(tempfile.gettempdir()) / f"claude-verify-{session_id or 'unknown'}.count"


def emit(payload: dict) -> None:
    print(json.dumps(payload))
    sys.exit(0)


def main() -> None:
    try:
        event = json.load(sys.stdin)
    except json.JSONDecodeError:
        event = {}
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or event.get("cwd") or ".").resolve()
    suites = suites_for(changed_files(root), root)
    if not suites:
        sys.exit(0)  # nothing testable changed: stay silent

    failures, passed = [], []
    for name, cmd, cwd in suites:
        try:
            r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=TIMEOUT_S, check=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            failures.append(f"== {name} tests could not run: {exc}")
            continue
        if r.returncode == 0:
            passed.append(name)
        else:
            tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-TAIL_LINES:])
            failures.append(f"== {name} tests failed ({' '.join(cmd)}):\n{tail}")

    counter = block_count_file(str(event.get("session_id", "")))
    if not failures:
        counter.unlink(missing_ok=True)
        emit({"systemMessage": f"Verified: {', '.join(passed)} tests pass for the changed files."})

    blocks = int(counter.read_text()) if counter.exists() else 0
    if blocks >= MAX_BLOCKS:
        counter.unlink(missing_ok=True)
        emit({"systemMessage": f"Tests still failing after {MAX_BLOCKS} attempts; needs a human look."})
    counter.write_text(str(blocks + 1))
    emit({
        "decision": "block",
        "reason": "Not done yet: the tests for the files you changed fail. Fix the code (not the tests, "
                  "unless a test is genuinely wrong), then finish.\n\n" + "\n\n".join(failures),
    })


if __name__ == "__main__":
    main()
