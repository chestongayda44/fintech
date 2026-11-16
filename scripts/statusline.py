#!/usr/bin/env python3
"""Claude Code status line for the demo: persona, model, session cost, time, lines, context.

Claude Code pipes session JSON on stdin (see code.claude.com/docs/en/statusline). We print one line
and record the session's running totals in a small ledger so scripts/cost-report.sh can total the
whole cross-team flow. The ledger holds only cost/time/line counts: no prompts, code or secrets.

Cost is Claude Code's own estimate at list price (or at contracted rates if the org sets the
`modelPricing` managed setting). On Bedrock/Vertex the authoritative bill is the cloud's billing.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path


def _fmt_duration(ms: float) -> str:
    s = int(ms // 1000)
    return f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"


def main() -> None:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        print("claude")
        return

    persona = os.environ.get("CLAUDE_PERSONA", "claude")
    model = (data.get("model") or {}).get("display_name") or (data.get("model") or {}).get("id", "claude")
    cost = data.get("cost") or {}
    usd = float(cost.get("total_cost_usd") or 0.0)
    dur_ms = float(cost.get("total_duration_ms") or 0.0)
    added = int(cost.get("total_lines_added") or 0)
    removed = int(cost.get("total_lines_removed") or 0)
    ctx = (data.get("context_window") or {}).get("used_percentage")
    ctx_txt = f" · ctx {int(ctx)}%" if isinstance(ctx, (int, float)) else ""

    print(f"{persona.upper()} · {model} · ${usd:.2f} · {_fmt_duration(dur_ms)} · +{added}/-{removed}{ctx_txt}")

    session = data.get("session_id")
    ledger_dir = os.environ.get("COST_LEDGER_DIR")
    if not (session and ledger_dir):
        return
    try:
        d = Path(ledger_dir)
        d.mkdir(parents=True, exist_ok=True)
        path = d / f"{session}.json"
        record = {}
        if path.exists():
            record = json.loads(path.read_text())
        record.update(
            session_id=session,
            persona=persona,
            started=record.get("started") or time.strftime("%Y-%m-%dT%H:%M:%S"),
            updated=time.strftime("%Y-%m-%dT%H:%M:%S"),
            cwd=os.path.basename(data.get("cwd") or os.getcwd()),
            usd=round(usd, 4),
            duration_ms=int(dur_ms),
            lines_added=added,
            lines_removed=removed,
        )
        models = set(record.get("models") or [])
        models.add(model)
        record["models"] = sorted(models)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(record))
        tmp.replace(path)
    except OSError:
        pass  # the status line must never break the session


if __name__ == "__main__":
    main()
