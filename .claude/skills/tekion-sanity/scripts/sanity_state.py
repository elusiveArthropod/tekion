#!/usr/bin/env python3
"""Run-state tracker for a Tekion sanity run. One JSON file per run, rendered for Slack.

  sanity_state.py <state.json> init --env PRE-PROD --base-url URL --checks "SB,WFB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS" [--window-min 60]
  sanity_state.py <state.json> set  <check> <status> ["note"] [--evidence URL]   status: PENDING RUNNING PASS FAIL AUTH_EXPIRED SKIPPED  (times render in IST)
  sanity_state.py <state.json> slack-ts <ts>          remember the Slack root post ts
  sanity_state.py <state.json> render [--plan|--progress|--final] [--max-chars 1500]
        print a Slack-formatted message; over --max-chars it is split on line boundaries into parts
        separated by a "=====PART n/N" line, each to be sent as its own reply, in order
  sanity_state.py <state.json> remaining                print checks not yet in a terminal state
  sanity_state.py <state.json> alert-since              print the Slack ts to use as `oldest` for the alert channel
"""
import json, sys, argparse, datetime as dt

TERMINAL = {"PASS", "FAIL", "SKIPPED"}
ICON = {"PENDING": "⬜", "RUNNING": "⏳", "PASS": "✅", "FAIL": "❌", "AUTH_EXPIRED": "⚠️", "SKIPPED": "⏭️"}
LABEL = {
    "SB": "Solution Builder — build a vendor onboarding + purchase request app, trace clean, 6 functional checks",
    "WFB": "Workflow Builder agent — explain an existing automation, then create one in the Sanity project",
    "FDE-UI": "AI FDE — copilot panel opens with conversation starters",
    "FDE-QA": "AI FDE — two platform how-to questions answered",
    "FDE-CRUD": "AI FDE — create, read, update, delete an automation in the Sanity project",
    "EVAL": "Evaluation — dataset + cases created, experiment run, scores present",
    "ALERTS": "Alert channel — new failed runs since start, each with root cause",
}
IST = dt.timezone(dt.timedelta(hours=5, minutes=30), "IST")

def now():
    return dt.datetime.now(IST).strftime("%d %b %Y, %H:%M IST")

def hhmm(iso):
    try:
        return dt.datetime.fromisoformat(iso).astimezone(IST).strftime("%H:%M IST")
    except Exception:
        return iso

PART_SEP = "=====PART"

def split_parts(lines, max_chars):
    """Split rendered lines into chunks under max_chars, on line boundaries only.
    A continuation chunk starts with "(continued)" so it reads correctly as its own reply.
    A single line longer than max_chars is truncated with an ellipsis; it should never happen with
    the note length rule, but a truncated line is better than a Slack rejection at midnight."""
    parts, cur = [], []
    for line in lines:
        if len(line) > max_chars - 1:
            line = line[: max_chars - 2] + "…"
        candidate = "\n".join(cur + [line])
        if cur and len(candidate) > max_chars:
            parts.append("\n".join(cur))
            cur = ["_(continued)_", line]
        else:
            cur.append(line)
    if cur: parts.append("\n".join(cur))
    return parts

def load(p):
    with open(p) as f:
        return json.load(f)

def save(p, s):
    with open(p, "w") as f:
        json.dump(s, f, indent=2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state"); ap.add_argument("cmd"); ap.add_argument("rest", nargs="*")
    ap.add_argument("--env"); ap.add_argument("--base-url"); ap.add_argument("--checks")
    ap.add_argument("--window-min", type=int, default=60); ap.add_argument("--evidence")
    ap.add_argument("--max-chars", type=int, default=1500, help="split rendered posts over this size on line boundaries")
    ap.add_argument("--plan", action="store_true"); ap.add_argument("--progress", action="store_true"); ap.add_argument("--final", action="store_true")
    a = ap.parse_args()

    if a.cmd == "init":
        checks = [c.strip() for c in (a.checks or "SB,WFB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS").split(",") if c.strip()]
        started_iso = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        s = {"env": a.env, "base_url": a.base_url, "started": now(), "started_iso": started_iso,
             "alert_since": started_iso, "alert_since_slack_ts": f"{dt.datetime.now(dt.timezone.utc).timestamp():.6f}",
             "window_min": a.window_min, "slack_ts": None,
             "checks": {c: {"status": "PENDING", "note": "", "evidence": [], "updated": now()} for c in checks},
             "alerts": []}
        save(a.state, s); print(f"initialised {len(checks)} checks"); return

    s = load(a.state)
    if a.cmd == "set":
        check, status = a.rest[0], a.rest[1].upper()
        note = a.rest[2] if len(a.rest) > 2 else ""
        c = s["checks"].setdefault(check, {"status": "PENDING", "note": "", "evidence": []})
        c["status"] = status; c["updated"] = now()
        if note: c["note"] = note
        if a.evidence: c["evidence"].append(a.evidence)
        save(a.state, s); print(f"{check} -> {status}"); return
    if a.cmd == "slack-ts":
        s["slack_ts"] = a.rest[0]; save(a.state, s); return
    if a.cmd == "alert-since":
        last = max([x.get("ts", "0") for x in s["alerts"]] + [s["alert_since_slack_ts"]]); print(last); return
    if a.cmd == "remaining":
        print("\n".join(k for k, v in s["checks"].items() if v["status"] not in TERMINAL)); return
    if a.cmd == "render":
        checks = s["checks"]
        lines = []
        if a.plan:
            lines += [f"🧪  *Tekion Platform Sanity — {s['env']}*",
                      f"_Started {s['started']}_", "",
                      f"*Target*   {s['base_url']}",
                      f"*Alert watch*   from now · every 5 min · at least {s['window_min']} min, and 10 min past the last check", "",
                      f"*Checks running in parallel ({len(checks)})*"]
            for k, v in checks.items():
                lines.append(f"{ICON[v['status']]}   `{k}`   {LABEL.get(k, k)}")
            lines += ["", "> Each check posts its result in this thread the moment it finishes.",
                      "> If a credential expires mid-run, the affected check posts ⚠️ with what is still left."]
        else:
            done = sum(1 for v in checks.values() if v["status"] in TERMINAL)
            fails = [k for k, v in checks.items() if v["status"] == "FAIL"]
            if fails: head = "❌  *SANITY FAILED"
            elif done == len(checks): head = "✅  *SANITY PASSED"
            else: head = "⏳  *SANITY IN PROGRESS"
            lines += [f"{head} — {s['env']}*", f"_{done}/{len(checks)} checks finished · {now()}_", ""]
            for k, v in checks.items():
                line = f"{ICON[v['status']]}   `{k}`   *{v['status']}*"
                if v["note"]: line += f"  —  {v['note']}"
                if v["evidence"]: line += f"   <{v['evidence'][-1]}|evidence>"
                lines.append(line)
            if a.final:
                rem = [k for k, v in checks.items() if v["status"] not in TERMINAL]
                sus = [x for x in s["alerts"] if x.get("classification") == "deployment-suspect"]
                lines += ["", f"*Alert watch*   {hhmm(s['alert_since'])} → {now()[-9:]} · {len(s['alerts'])} new failed run(s), {len(sus)} deployment-suspect",
                          "_Alerts from before this run were intentionally not read._"]
                if rem: lines += ["", f"*Not completed*   {', '.join(rem)}"]
        parts = split_parts(lines, a.max_chars)
        if len(parts) == 1:
            print(parts[0])
        else:
            for i, part in enumerate(parts, 1):
                if i > 1: print(f"\n{PART_SEP} {i}/{len(parts)}\n")
                print(part)
        return
    sys.exit(f"unknown cmd {a.cmd}")

if __name__ == "__main__":
    main()
