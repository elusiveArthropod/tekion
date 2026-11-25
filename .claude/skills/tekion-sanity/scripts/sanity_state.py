#!/usr/bin/env python3
"""Run-state tracker for a Tekion sanity run. One JSON file per run, rendered for Slack.

  sanity_state.py <state.json> init --env PRE-PROD --base-url URL --checks "SB,FDE-UI,FDE-QA,EVAL,ALERTS" [--window-min 60]
  sanity_state.py <state.json> set  <check> <status> ["note"] [--evidence URL]   status: PENDING RUNNING PASS FAIL AUTH_EXPIRED SKIPPED
  sanity_state.py <state.json> slack-ts <ts>          remember the Slack root post ts
  sanity_state.py <state.json> render [--plan|--progress|--final]   print a Slack-formatted message
  sanity_state.py <state.json> remaining                print checks not yet in a terminal state
  sanity_state.py <state.json> alert-since              print the Slack ts to use as `oldest` for the alert channel
"""
import json, sys, argparse, datetime as dt

TERMINAL = {"PASS", "FAIL", "SKIPPED"}
ICON = {"PENDING": "⬜", "RUNNING": "⏳", "PASS": "✅", "FAIL": "❌", "AUTH_EXPIRED": "⚠️", "SKIPPED": "⏭️"}
LABEL = {
    "SB": "Solution Builder: build from fixed prompt, session clean, app works",
    "FDE-UI": "AI FDE: agent configured, copilot panel opens with conversation starters",
    "FDE-QA": "AI FDE: two platform questions answered",
    "EVAL": "Evaluation: create dataset + cases, run experiment, scores present",
    "ALERTS": "Alert channel: new automation failures since start, with root cause",
}

def now():
    return dt.datetime.now(dt.timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")

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
    ap.add_argument("--plan", action="store_true"); ap.add_argument("--progress", action="store_true"); ap.add_argument("--final", action="store_true")
    a = ap.parse_args()

    if a.cmd == "init":
        checks = [c.strip() for c in (a.checks or "SB,FDE-UI,FDE-QA,EVAL,ALERTS").split(",") if c.strip()]
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
        lines = []
        if a.plan:
            lines.append(f"🧪 *Tekion platform sanity — {s['env']}* started {s['started']}")
            lines.append(f"Target: {s['base_url']}  |  Alert watch: from now, every 5 min, at least {s['window_min']} min and 10 min past the last check")
            lines.append(f"Running *{len(s['checks'])} checks in parallel*. Each posts its result in this thread as it finishes.")
            for i, (k, v) in enumerate(s["checks"].items(), 1):
                lines.append(f"{i}. {ICON[v['status']]} `{k}` — {LABEL.get(k, k)}")
            lines.append("_If the session cookie expires mid-run, the affected check posts ⚠️ and lists what is left._")
        else:
            done = sum(1 for v in s["checks"].values() if v["status"] in TERMINAL)
            fails = [k for k, v in s["checks"].items() if v["status"] == "FAIL"]
            verdict = "❌ *SANITY FAILED*" if fails else ("✅ *SANITY PASSED*" if done == len(s["checks"]) else "⏳ *SANITY IN PROGRESS*")
            lines.append(f"{verdict} — {s['env']} — {done}/{len(s['checks'])} checks finished ({now()})")
            for k, v in s["checks"].items():
                ev = f" <{v['evidence'][-1]}|evidence>" if v["evidence"] else ""
                lines.append(f"{ICON[v['status']]} `{k}` {v['status']}{(' — ' + v['note']) if v['note'] else ''}{ev}")
            if a.final:
                rem = [k for k, v in s["checks"].items() if v["status"] not in TERMINAL]
                lines.append(f"Alert watch covered {s['alert_since']} → {now()} (older alerts intentionally not shown)")
                if rem: lines.append(f"Not completed: {', '.join(rem)}")
                if s["alerts"]: lines.append(f"New automation failures during window: {len(s['alerts'])}")
        print("\n".join(lines)); return
    sys.exit(f"unknown cmd {a.cmd}")

if __name__ == "__main__":
    main()
