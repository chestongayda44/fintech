#!/usr/bin/env python3
"""Cost per persona for the demo run, from the ledger written by scripts/statusline.py.

Usage:  python3 scripts/cost-report.py            # this run (since the last --reset)
        python3 scripts/cost-report.py --reset    # start a fresh ledger (demo-reset.sh does this)
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import defaultdict
from pathlib import Path

LEDGER = Path(__file__).resolve().parent.parent / ".claude" / "cost-ledger"

# What each team produced in the demo, for the "cost per outcome" line.
OUTCOMES = {
    "ds": "FRED data → validated model → tested package, published",
    "swe": "stress-test dashboard with parity tests",
    "sre": "root cause, verified fix, 16-service security sweep",
}
ORDER = ["ds", "swe", "sre"]


def main() -> int:
    if "--reset" in sys.argv:
        shutil.rmtree(LEDGER, ignore_errors=True)
        print("cost ledger cleared")
        return 0

    rows = []
    if LEDGER.exists():
        for f in LEDGER.glob("*.json"):
            try:
                rows.append(json.loads(f.read_text()))
            except (OSError, json.JSONDecodeError):
                continue
    if not rows:
        print("No sessions recorded yet. Launch Claude with ds / swe / sre (source scripts/personas.sh).")
        return 0

    by = defaultdict(lambda: {"usd": 0.0, "ms": 0, "added": 0, "sessions": 0, "models": set()})
    for r in rows:
        p = by[r.get("persona", "claude")]
        p["usd"] += float(r.get("usd", 0))
        p["ms"] += int(r.get("duration_ms", 0))
        p["added"] += int(r.get("lines_added", 0))
        p["sessions"] += 1
        p["models"].update(r.get("models") or [])

    personas = [k for k in ORDER if k in by] + sorted(k for k in by if k not in ORDER)
    print(f"{'Team':<6}{'Cost':>9}{'Agent time':>12}{'Lines':>8}  Models / outcome")
    print("-" * 78)
    total_usd = total_ms = 0
    for k in personas:
        p = by[k]
        total_usd += p["usd"]
        total_ms += p["ms"]
        mins = p["ms"] / 60000
        print(f"{k.upper():<6}{'$' + format(p['usd'], '.2f'):>9}{mins:>10.1f}m{p['added']:>8}  {', '.join(sorted(p['models']))}")
        if k in OUTCOMES:
            print(f"{'':<35}{OUTCOMES[k]}")
    print("-" * 78)
    print(f"{'TOTAL':<6}{'$' + format(total_usd, '.2f'):>9}{total_ms / 60000:>10.1f}m")
    print("\nEstimate at list price from Claude Code's own token counts; your Bedrock/Vertex bill is authoritative.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
