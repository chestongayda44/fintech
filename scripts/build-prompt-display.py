#!/usr/bin/env python3
"""Build docs/prompt-display.html: a full-screen visual aid that shows the audience the prompt behind
each slash command (they only see `/graduate` typed; this shows what Claude was actually asked).

The prompt text comes straight from .claude/commands/*.md, so the display never drifts from what
Claude receives. Re-run after editing a command:   python3 scripts/build-prompt-display.py

Presenting: open docs/prompt-display.html in a browser on the shared screen.
  → / Space next   ← back   0–6 jump to a stage   F full screen   C switch the DS cloud label
  ?ds=bedrock in the URL starts with Data Science on Bedrock.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMMANDS = ROOT / ".claude" / "commands"
OUT = ROOT / "docs" / "prompt-display.html"

TEAMS = {
    "ds": {"name": "Data Science", "color": "#A8327A"},
    "swe": {"name": "Software Engineering", "color": "#2453A0"},
    "sre": {"name": "Site Reliability", "color": "#1D7449"},
    "all": {"name": "Every team", "color": "#3A4656"},
}

# One entry per screen. `command` set: prompt text is read from .claude/commands/<command>.md.
# `typed`: text typed live (no command file). `marks`: phrases to highlight as guardrails.
SLIDES = [
    {"stage": "0", "id": "guardrails", "team": "swe", "title": "Guardrails, live",
     "typed": ["What's in the .env file?",
               "Add a sample transaction with card number 4111 1111 1111 1111 to a test fixture so we can test masking."],
     "outcome": "Both refused. The first by the repo's permission rules, the second by a hook that scans every write for card numbers.",
     "dial": "Rules set by the team, enforced by the tool",
     "security": "It can't read your secrets and can't write card data, whoever asks."},
    {"stage": "1", "id": "acquire", "team": "ds", "command": "acquire",
     "marks": ["key in the FRED_API_KEY env var", "justify the choice"],
     "dial": "Open: exploring in a notebook",
     "security": "The API key is read from the environment and never appears in the notebook or the chat."},
    {"stage": "2", "id": "explore", "team": "ds", "command": "explore",
     "marks": ["at least 2 of 3"],
     "dial": "Open: exploring in a notebook",
     "security": "Public data only; the team's data rules live in CLAUDE.md and every session follows them."},
    {"stage": "3", "id": "fit-model", "team": "ds", "command": "fit-model",
     "marks": ["Sanity-check it before going further."],
     "dial": "Open, with a check built in",
     "security": "Model risk: assumptions stated and the model challenged before anyone relies on it."},
    {"stage": "3", "id": "fix-model", "team": "ds", "command": "fix-model",
     "marks": ["show how much that exclusion matters"],
     "dial": "Open, with a check built in",
     "security": "Model risk: interpretable, documented and validated, as SR 11-7 expects."},
    {"stage": "4", "id": "graduate", "team": "ds", "command": "graduate",
     "marks": ["so production doesn't depend on the notebook", "pytest tests"],
     "dial": "Tighter: production code, tests required to finish",
     "security": "Every write is scanned; data is published to your bucket under your IAM."},
    {"stage": "5", "id": "stress-panel", "team": "swe", "command": "stress-panel",
     "marks": ["Vitest tests proving the TypeScript matches"],
     "dial": "Tighter: a person approves the plan before any change",
     "security": "Change control: the plan is approved and the diff is reviewable."},
    {"stage": "6", "id": "incident", "team": "sre", "command": "incident",
     "marks": ["Use only file reads and searches", "don't change anything"],
     "dial": "Tightest: diagnosis is read-only",
     "security": "Least privilege: the agent investigates production without being able to change it."},
    {"stage": "6", "id": "sweep", "team": "sre", "command": "sweep",
     "marks": ["Don't change anything."],
     "dial": "Tightest: reviewers can only read",
     "security": "16 services audited for silent fallbacks, secrets in code, card data in logs and missing timeouts."},
    {"stage": "6", "id": "fix", "team": "sre", "title": "The fix goes in",
     "typed": ["bash scripts/apply-fix.sh"],
     "outcome": "A person applies the team's reviewed fix. The nightly job re-runs and the freshness check passes, or the job now fails loudly.",
     "dial": "Tightest: a person applies the fix",
     "security": "The agent proposed; a person decided."},
    {"stage": "6", "id": "cost", "team": "all", "title": "What it cost",
     "typed": ["python3 scripts/cost-report.py"],
     "outcome": "Model usage for the whole flow, per team, from Claude Code's own token counts. Your AWS and GCP bills are authoritative.",
     "dial": "Cost visible per session and per team",
     "security": "Spend lands in your own cloud billing, with your budgets and alerts."},
]


def command_body(name: str) -> str:
    text = (COMMANDS / f"{name}.md").read_text()
    parts = text.split("---", 2)
    body = parts[2] if text.startswith("---") and len(parts) == 3 else text
    # Join hard-wrapped lines into paragraphs.
    paras = [" ".join(p.split()) for p in re.split(r"\n\s*\n", body.strip())]
    return "\n\n".join(p for p in paras if p)


def render(text: str, marks: list[str]) -> str:
    out = html.escape(text, quote=False)
    for m in marks:
        em = html.escape(m, quote=False)
        if em in out:
            out = out.replace(em, f"<mark>{em}</mark>", 1)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return "".join(f"<p>{p}</p>" for p in out.split("\n\n"))


def build() -> str:
    slides = []
    for s in SLIDES:
        team = TEAMS[s["team"]]
        if "command" in s:
            head = f"/{s['command']}"
            body = render(command_body(s["command"]), s.get("marks", []))
            kind = "command"
        else:
            head = s["title"]
            typed = "".join(f"<pre>{html.escape(t)}</pre>" for t in s["typed"])
            body = typed + f"<p class=\"outcome\">{html.escape(s['outcome'])}</p>"
            kind = "typed"
        slides.append({
            "id": s["id"], "stage": s["stage"], "team": s["team"], "teamName": team["name"],
            "color": team["color"], "head": head, "kind": kind, "body": body,
            "dial": s["dial"], "security": s["security"],
        })
    return TEMPLATE.replace("__SLIDES__", json.dumps(slides, ensure_ascii=False))


TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FinTechCo × Claude Code: what Claude was asked</title>
<style>
  :root {
    --paper: #E9EDE7;
    --sheet: #F6F7F3;
    --ink: #17212E;
    --muted: #5A6472;
    --rule: #CCD3CB;
    --team: #3A4656;
    --sans: "Avenir Next", "Avenir", "Segoe UI", system-ui, sans-serif;
    --mono: "SF Mono", "Menlo", "Consolas", ui-monospace, monospace;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--paper); color: var(--ink); font-family: var(--sans); }
  body { display: grid; grid-template-columns: minmax(170px, 15vw) 1fr; height: 100vh; overflow: hidden; }

  nav { padding: 3.2vh 1.4vw; display: flex; flex-direction: column; gap: 0.2rem; overflow: hidden; }
  nav .stage { display: grid; grid-template-columns: 1.8em 1fr; align-items: baseline; margin-top: 1.1vh; }
  nav .num { font-size: 1.05rem; font-weight: 600; color: var(--muted); }
  nav ol { list-style: none; margin: 0; padding: 0; }
  nav button {
    all: unset; cursor: pointer; display: block; width: 100%; padding: 0.22rem 0.5rem; border-radius: 4px;
    font-family: var(--mono); font-size: 0.9rem; color: var(--muted); border-left: 3px solid transparent;
  }
  nav button:hover { color: var(--ink); }
  nav button:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  nav button.label { font-family: var(--sans); font-size: 0.95rem; }
  nav button[aria-current="step"] { color: var(--ink); background: var(--sheet); border-left-color: var(--team); font-weight: 600; }
  nav .done { color: #8C95A0; }

  main { padding: 3.2vh 3.2vw 3.2vh 1vw; display: flex; min-width: 0; min-height: 0; }
  .sheet {
    flex: 1; min-height: 0; display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; background: var(--sheet);
    border-radius: 10px; overflow: hidden; box-shadow: 0 1px 0 var(--rule);
  }
  .band { background: var(--team); color: #fff; padding: 2.2vh 3vw 2.4vh; transition: background-color 250ms ease; }
  .who { font-size: clamp(1rem, 1.6vw, 1.6rem); font-weight: 500; opacity: 0.92; }
  .who b { font-weight: 700; }
  .head {
    margin: 0.6vh 0 0; font-family: var(--mono); font-weight: 600; letter-spacing: -0.01em;
    font-size: clamp(2.4rem, 6.2vw, 6.4rem); line-height: 1.05;
  }
  .head.title { font-family: var(--sans); font-weight: 700; letter-spacing: -0.02em; }
  .asked { padding: 2.6vh 3vw 0; font-size: clamp(0.95rem, 1.3vw, 1.25rem); color: var(--muted); }
  .body { padding: 1vh 3vw 2vh; overflow: hidden; min-height: 0; }
  .body p { margin: 0 0 0.7em; max-width: 46em; line-height: 1.42; font-size: var(--fs, 2.2rem); }
  .body mark { background: color-mix(in srgb, var(--team) 16%, transparent); color: inherit; padding: 0 0.12em; border-radius: 3px;
               box-shadow: inset 0 -0.14em 0 color-mix(in srgb, var(--team) 55%, transparent); }
  .body code { font-family: var(--mono); font-size: 0.86em; background: #E4E8E1; padding: 0.05em 0.3em; border-radius: 4px; }
  .body pre {
    margin: 0 0 0.8em; padding: 0.55em 0.8em; font-family: var(--mono); font-size: var(--fs, 2.2rem); line-height: 1.3;
    white-space: pre-wrap; background: #1D2733; color: #F2F4EF; border-radius: 8px; border-left: 6px solid var(--team);
  }
  .body pre::before { content: "> "; color: #8C98A6; }
  .body .outcome { color: var(--ink); }
  footer { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--rule); }
  footer div { padding: 1.8vh 3vw 2.2vh; font-size: clamp(0.95rem, 1.25vw, 1.3rem); line-height: 1.35; }
  footer div + div { border-left: 1px solid var(--rule); }
  footer span { display: block; color: var(--muted); font-size: 0.82em; margin-bottom: 0.2em; }

  .hint { position: fixed; right: 1.2vw; bottom: 0.6vh; font-size: 0.8rem; color: var(--muted); transition: opacity 600ms; }
  .hint.hide { opacity: 0; }
  @media (prefers-reduced-motion: reduce) { .band, .hint { transition: none; } }
  @media (max-width: 760px) {
    body { grid-template-columns: 1fr; }
    nav { flex-direction: row; flex-wrap: wrap; padding: 1rem; }
    footer { grid-template-columns: 1fr; }
    footer div + div { border-left: 0; border-top: 1px solid var(--rule); }
  }
</style>
</head>
<body>
<nav aria-label="Demo stages"></nav>
<main>
  <article class="sheet" aria-live="polite">
    <header class="band">
      <div class="who"></div>
      <h1 class="head"></h1>
    </header>
    <div class="asked"></div>
    <section class="body"></section>
    <footer>
      <div><span>Supervision</span><b class="dial"></b></div>
      <div><span>Security</span><b class="security"></b></div>
    </footer>
  </article>
</main>
<div class="hint">← → step · 0–6 jump · F full screen · C switch DS cloud</div>
<script>
const SLIDES = __SLIDES__;
const CLOUD = { ds: "Google Vertex AI", swe: "Amazon Bedrock", sre: "Amazon Bedrock", all: "AWS and GCP" };
const params = new URLSearchParams(location.search);
if (params.get("ds") === "bedrock") CLOUD.ds = "Amazon Bedrock";

const $ = (s) => document.querySelector(s);
const nav = $("nav");
let i = Math.max(0, SLIDES.findIndex((s) => "#" + s.id === location.hash));

// Rail: stages are a real sequence, so they're numbered.
const stages = [...new Set(SLIDES.map((s) => s.stage))];
for (const st of stages) {
  const g = document.createElement("div");
  g.className = "stage";
  g.innerHTML = `<span class="num">${st}</span><ol></ol>`;
  for (const s of SLIDES.filter((x) => x.stage === st)) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = s.kind === "command" ? s.head : s.head;
    if (s.kind !== "command") b.classList.add("label");
    b.dataset.i = SLIDES.indexOf(s);
    b.style.setProperty("--team", s.color);
    b.addEventListener("click", () => show(+b.dataset.i));
    li.append(b);
    g.querySelector("ol").append(li);
  }
  nav.append(g);
}

function fit() {
  // Largest prompt size that fits the space, so long prompts stay readable without scrolling.
  const body = $(".body");
  let fs = Math.min(innerWidth / 30, innerHeight / 17, 46);
  body.style.setProperty("--fs", fs + "px");
  while (body.scrollHeight > body.clientHeight && fs > 15) {
    fs -= 1;
    body.style.setProperty("--fs", fs + "px");
  }
}

function show(n) {
  i = Math.min(SLIDES.length - 1, Math.max(0, n));
  const s = SLIDES[i];
  document.documentElement.style.setProperty("--team", s.color);
  $(".who").innerHTML = `<b>${s.teamName}</b>, through ${CLOUD[s.team]}`;
  const head = $(".head");
  head.textContent = s.head;
  head.classList.toggle("title", s.kind !== "command");
  $(".asked").textContent = s.kind === "command" ? "What that command asks Claude:" : "Typed in the terminal:";
  $(".body").innerHTML = s.body;
  $(".dial").textContent = s.dial;
  $(".security").textContent = s.security;
  nav.querySelectorAll("button").forEach((b) => {
    const k = +b.dataset.i;
    b.toggleAttribute("aria-current", false);
    if (k === i) b.setAttribute("aria-current", "step");
    b.classList.toggle("done", k < i);
  });
  history.replaceState(null, "", location.pathname + location.search + "#" + s.id);
  fit();
}

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === "ArrowRight" || k === " " || k === "PageDown") { e.preventDefault(); show(i + 1); }
  else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); show(i - 1); }
  else if (/^[0-6]$/.test(k)) show(SLIDES.findIndex((s) => s.stage === k));
  else if (k === "f" || k === "F") {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
  } else if (k === "c" || k === "C") {
    CLOUD.ds = CLOUD.ds === "Google Vertex AI" ? "Amazon Bedrock" : "Google Vertex AI";
    show(i);
  }
});
addEventListener("resize", fit);
addEventListener("hashchange", () => {
  const n = SLIDES.findIndex((s) => "#" + s.id === location.hash);
  if (n >= 0 && n !== i) show(n);
});
setTimeout(() => $(".hint").classList.add("hide"), 5000);
show(i);
</script>
</body>
</html>
"""


if __name__ == "__main__":
    OUT.write_text(build())
    print(f"wrote {OUT.relative_to(ROOT)} ({len(SLIDES)} screens)")
