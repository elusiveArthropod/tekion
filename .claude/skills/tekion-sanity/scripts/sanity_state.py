#!/usr/bin/env python3
"""Run-state tracker for a Tekion sanity run. One JSON file per run, rendered for Slack.

  sanity_state.py <state.json> init --env PRE-PROD --base-url URL --checks "SB,WB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS" [--window-min 60]
  sanity_state.py <state.json> set  <check> <status> ["note"] [--evidence URL]   status: PENDING RUNNING PASS FAIL AUTH_EXPIRED SKIPPED
  sanity_state.py <state.json> slack-ts <ts>          remember the Slack root post ts
  sanity_state.py <state.json> alert add <ts> <deployment-suspect|pre-existing|tbd> "<name>"   record a reported alert
  sanity_state.py <state.json> created add <check> "<what>" [--deleted yes|no]   record an asset the run created
  sanity_state.py <state.json> render [--plan|--progress|--final]   print a Slack message (Markdown: **bold**, see slack-templates.md)
  sanity_state.py <state.json> remaining                print checks not yet in a terminal state
  sanity_state.py <state.json> alert-since              print the Slack ts to use as `oldest` for the alert channel

Formatting rule (the team found the old output congested): one idea per line, a blank line
between sections, bold labels, bullets for parallel items, no run-on paragraphs.
"""
import json, sys, argparse, datetime as dt

TERMINAL = {"PASS", "FAIL", "SKIPPED"}
ICON = {"PENDING": "⬜", "RUNNING": "⏳", "PASS": "✅", "FAIL": "❌", "AUTH_EXPIRED": "⚠️", "SKIPPED": "⏭️"}
LABEL = {
    "SB": "Solution Builder builds the vendor-invoice approval portal, session trace clean, app passes the functional script",
    "WB": "Workflow Builder copilot explains an existing automation, then builds a new one from the fixed prompt",
    "FDE-UI": "AI FDE copilot panel opens with its greeting and conversation starters",
    "FDE-QA": "AI FDE answers two platform how-to questions",
    "FDE-CRUD": "AI FDE creates, reads, updates and deletes a sanity dataset on request, verified through the API",
    "EVAL": "Evaluation: dataset and cases created, experiment runs, scores present",
    "ALERTS": "Alert channel: new automation failures since start, each with a root cause and a classification",
}
DEFAULT_CHECKS = "SB,WB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS"

def now():
    return dt.datetime.now(dt.timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M %Z")

def load(p):
    with open(p) as f:
        return json.load(f)

def save(p, s):
    with open(p, "w") as f:
        json.dump(s, f, indent=2)

def section(title, items):
    """Bold label on its own line, then bullets. Empty list -> nothing."""
    if not items:
        return []
    return [f"**{title}**"] + [f"• {i}" for i in items] + [""]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("state"); ap.add_argument("cmd"); ap.add_argument("rest", nargs="*")
    ap.add_argument("--env"); ap.add_argument("--base-url"); ap.add_argument("--checks")
    ap.add_argument("--window-min", type=int, default=60); ap.add_argument("--evidence")
    ap.add_argument("--deleted", choices=["yes", "no"])
    ap.add_argument("--plan", action="store_true"); ap.add_argument("--progress", action="store_true"); ap.add_argument("--final", action="store_true")
    a = ap.parse_args()

    if a.cmd == "init":
        checks = [c.strip() for c in (a.checks or DEFAULT_CHECKS).split(",") if c.strip()]
        started_iso = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        s = {"env": a.env, "base_url": a.base_url, "started": now(), "started_iso": started_iso,
             "alert_since": started_iso, "alert_since_slack_ts": f"{dt.datetime.now(dt.timezone.utc).timestamp():.6f}",
             "window_min": a.window_min, "slack_ts": None,
             "checks": {c: {"status": "PENDING", "note": "", "evidence": [], "updated": now()} for c in checks},
             "alerts": [], "created": []}
        save(a.state, s); print(f"initialised {len(checks)} checks"); return

    s = load(a.state)
    s.setdefault("alerts", []); s.setdefault("created", [])
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
    if a.cmd == "alert":
        # alert add <ts> <class> "<name>"
        _, ts, cls, name = (a.rest + ["", "", "", ""])[:4]
        cls = {"deployment-suspect": "deployment-suspect", "pre-existing": "pre-existing"}.get(cls, "tbd")
        s["alerts"].append({"ts": ts, "class": cls, "name": name, "at": now()})
        save(a.state, s); print(f"alert recorded ({cls}): {name}"); return
    if a.cmd == "created":
        # created add <check> "<what>" [--deleted yes|no]
        _, check, what = (a.rest + ["", "", ""])[:3]
        s["created"].append({"check": check, "what": what, "deleted": a.deleted == "yes"})
        save(a.state, s); print(f"created recorded: {what}"); return
    if a.cmd == "alert-since":
        last = max([x.get("ts", "0") for x in s["alerts"]] + [s["alert_since_slack_ts"]]); print(last); return
    if a.cmd == "remaining":
        print("\n".join(k for k, v in s["checks"].items() if v["status"] not in TERMINAL)); return
    if a.cmd == "render":
        lines = []
        checks = s["checks"]
        if a.plan:
            lines += [f"🧪 **Tekion platform sanity · {s['env']}**", f"Started {s['started']}", ""]
            lines += section("Run", [
                f"Target: <{s['base_url']}|{s['base_url'].split('//')[-1]}>",
                f"{len(checks)} checks run in parallel; each one posts its own result in this thread the moment it finishes",
                f"Alert watch: every 5 min, at least {s['window_min']} min, and at least 10 min past the last check",
            ])
            lines.append("**Checks**")
            for i, (k, v) in enumerate(checks.items(), 1):
                lines.append(f"{i}. {ICON[v['status']]} `{k}` · {LABEL.get(k, k)}")
            lines += ["", "_If the session cookie expires mid-run, the affected check posts ⚠️ and lists what is left._"]
        else:
            done = sum(1 for v in checks.values() if v["status"] in TERMINAL)
            fails = [k for k, v in checks.items() if v["status"] == "FAIL"]
            suspect = [x for x in s["alerts"] if x["class"] == "deployment-suspect"]
            preex = [x for x in s["alerts"] if x["class"] == "pre-existing"]
            tbd = [x for x in s["alerts"] if x["class"] == "tbd"]
            if a.final:
                verdict = "❌ **SANITY FAILED**" if (fails or suspect) else "✅ **SANITY PASSED**"
            else:
                verdict = "⏳ **SANITY IN PROGRESS**"
            lines += [f"{verdict} · {s['env']}", f"{done}/{len(checks)} checks finished · {now()}", ""]

            def row(k, v):
                ev = f" · <{v['evidence'][-1]}|evidence>" if v["evidence"] else ""
                note = f" · {v['note']}" if v["note"] else ""
                return f"{ICON[v['status']]} `{k}`{note}{ev}"
            lines += section("Failed", [row(k, v) for k, v in checks.items() if v["status"] == "FAIL"])
            lines += section("Passed", [row(k, v) for k, v in checks.items() if v["status"] == "PASS"])
            lines += section("Not finished" if a.final else "Still running",
                             [row(k, v) for k, v in checks.items() if v["status"] not in TERMINAL])
            lines += section("Skipped", [row(k, v) for k, v in checks.items() if v["status"] == "SKIPPED"])
            alert_items = []
            if suspect: alert_items.append(f"{len(suspect)} deployment-suspect: " + ", ".join(x["name"] for x in suspect))
            if preex: alert_items.append(f"{len(preex)} pre-existing (verdict-neutral): " + ", ".join(x["name"] for x in preex))
            if tbd: alert_items.append(f"{len(tbd)} root cause TBD: " + ", ".join(x["name"] for x in tbd))
            if not alert_items: alert_items.append("none since start")
            lines += section("New automation failures", alert_items)
            if a.final:
                kept = [c["what"] for c in s["created"] if not c["deleted"]]
                gone = [c["what"] for c in s["created"] if c["deleted"]]
                cleanup = []
                if gone: cleanup.append("Deleted: " + ", ".join(gone))
                if kept: cleanup.append("⚠️ Not deleted: " + ", ".join(kept))
                if not cleanup: cleanup.append("nothing recorded")
                lines += section("Cleanup", cleanup)
                lines.append(f"_Alert watch covered {s['alert_since']} → {now()}. Older alerts are intentionally not shown._")
        while lines and lines[-1] == "":
            lines.pop()
        print("\n".join(lines)); return
    sys.exit(f"unknown cmd {a.cmd}")

if __name__ == "__main__":
    main()
