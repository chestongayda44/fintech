"""Tests for the PreToolUse guardrail hook. Test values are built at runtime so
this file itself never contains a literal secret or card number."""
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / ".claude" / "hooks" / "guard_secrets.py"


def _luhn_complete(prefix: str) -> str:
    for check in "0123456789":
        candidate = prefix + check
        total = 0
        for i, ch in enumerate(reversed(candidate)):
            n = int(ch)
            if i % 2 == 1:
                n = n * 2 - 9 if n * 2 > 9 else n * 2
            total += n
        if total % 10 == 0:
            return candidate
    raise AssertionError("unreachable")


def run_hook(tool_name: str, tool_input: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(HOOK)],
        input=json.dumps({"tool_name": tool_name, "tool_input": tool_input}),
        capture_output=True,
        text=True,
    )


def test_allows_clean_code():
    r = run_hook("Write", {"file_path": "a.py", "content": "key = os.environ['FRED_API_KEY']\n"})
    assert r.returncode == 0


def test_blocks_card_number():
    pan = _luhn_complete("4" + "1" * 14)
    r = run_hook("Write", {"file_path": "a.py", "content": f"log.info('card {pan}')"})
    assert r.returncode == 2
    assert "card number" in r.stderr


def test_blocks_hardcoded_fred_key():
    fake = "ab12" * 8
    r = run_hook("Edit", {"file_path": "a.py", "new_string": f'FRED_API_KEY = "{fake}"'})
    assert r.returncode == 2


def test_blocks_aws_key_in_multiedit():
    fake = "AKIA" + "Z" * 16
    r = run_hook("MultiEdit", {"file_path": "a.py", "edits": [{"new_string": fake}]})
    assert r.returncode == 2


def test_ignores_non_luhn_long_numbers():
    r = run_hook("Write", {"file_path": "a.py", "content": "order_id = 1234567890123456"})
    assert r.returncode == 0
