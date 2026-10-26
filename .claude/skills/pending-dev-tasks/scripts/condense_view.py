#!/usr/bin/env python3
"""Condense a saved fetch_issues (scope: view) result into one line per ticket,
or split a finished post into Slack-sized parts.

Usage:
  python3 -I condense_view.py <saved-fetch_issues-file> > view.txt
      prints: KEY [status] pri dev=.. mod=.. env=.. | title | assignees | raised DD Mon | open Nd | threads | other
      writes: view.json next to the input (same fields, machine readable)
  python3 -I condense_view.py --split <post.md> [max_chars=4700]
      writes: part1.txt, part2.txt, ... next to the post, split on line boundaries
"""
import datetime, json, os, re, sys

OPT = {
 "e_1ba00243fb3725d59cae62a3":"Feature","e_d51dc5283d6365c312c865cf":"Bug","e_feec88a4ec095231f7b1e3a2":"Improvement","e_b11aff7558c171f61b6bb79f":"Task",
 "e_0574685aa63b7e2a8401d3ce":"Application","e_f4284fc0c502f93b6594a3be":"Automation","e_55f453730c2a50931496b1bf":"Platform","e_e29a338651389353cfe79ec6":"Connector","e_4cf07e73022c6c45899db345":"Agents","e_1ab2143af91e6c20c0119f8a":"Changeset","e_b00965d1e00892b17fa6e134":"API Group","e_ba33aa364f0eb40a6f7a8b7a":"Object Manager","e_b2def32365a01523da358b96":"Infra","e_24dd6e0dfcbdf7379f3516aa":"Pipeline","e_f67de52242bf4cf3ed74e9bd":"Product",
 "e_0dbc627df3af346cbca526d9":"Prod","e_dc095f8dfc61546e75d777c2":"PreProd","e_86e9f37ce6a8a787521b9d4c":"InternalUA",
 "e_67bbbf4d8a30491460ce98d5":"UI","e_4b70001e6e5e679dd55240f3":"BE","e_6f2b3865d64afedcff6ba220":"UI+BE","e_e638e7aa8cdd0e5721cb2c8b":"Config","e_1932197870cc34fa885c1b8f":"Infra","e_d6dcb7869e99f35f39fdceb3":"QA","e_d9971c0d605ae1ab79c4a688":"Design","e_b9053034eac409bb1210452b":"Product","e_d941f82bdd22e71df40bdf78":"Connector","e_ad0c8497211a883f3cc00bb5":"DevOps",
}
F = {"type":"e_f15bd1be633fc74e8194fe3d","dev":"e_75f04c909919f9d70af3e50d","env":"e_3266dd9e066e8eb021338b16","module":"e_08962458943de84beb8036bf"}
PRI = {0:"-",1:"low",2:"med",3:"HIGH",4:"URG"}
GROUP_ORDER = ["Infra","DevOps","BE","Connector","UI","UI+BE","Product","Config","QA","Design"]

def labels(cf, fid):
    v = cf.get(fid)
    if isinstance(v, dict): v = v.get("v")
    return [OPT.get(x, x) for x in v] if isinstance(v, list) else []

def load_rows(path):
    raw = open(path, encoding="utf-8", errors="replace").read()
    i = raw.find("{")
    d = json.loads(raw[i:])
    return d.get("rows", [])

def condense(path):
    today = datetime.datetime.now(datetime.UTC).date()
    out = []
    for r in load_rows(path):
        p = r["properties"]; cf = p.get("cf", {})
        links = p.get("links") or []
        slack = [l["url"] for l in links if "slack.com" in l.get("url", "")]
        other = [l["url"] for l in links if "slack.com" not in l.get("url", "")]
        ts = []
        for u in slack:
            m = re.search(r"thread_ts=(\d{10})", u) or re.search(r"/p(\d{10})", u)
            if m: ts.append(int(m.group(1)))
        raised = datetime.datetime.fromtimestamp(min(ts), datetime.UTC).date() if ts else datetime.datetime.fromtimestamp(r["createdTime"]/1000, datetime.UTC).date()
        row = {
            "key": p["identifier"], "id": r["id"], "version": r.get("version"), "status": r["statusName"],
            "priority": PRI.get(p.get("priority"), p.get("priority")), "title": p["title"],
            "assignees": r.get("assigneeNames", []), "dev": labels(cf, F["dev"]), "module": labels(cf, F["module"]),
            "env": labels(cf, F["env"]), "type": labels(cf, F["type"]), "parent": (r.get("parent") or {}).get("identifier"),
            "due": p.get("dueDate"), "raised": raised.isoformat(), "open_days": (today - raised).days,
            "raised_from": "thread" if ts else "created", "slack": slack, "other": other,
        }
        out.append(row)
    def gkey(o):
        g = o["dev"][0] if o["dev"] else "zz"
        return (GROUP_ORDER.index(g) if g in GROUP_ORDER else 99, -o["open_days"])
    out.sort(key=gkey)
    json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(path)), "view.json"), "w"), indent=1)
    for o in out:
        due = datetime.datetime.fromtimestamp(o["due"]/1000, datetime.UTC).strftime("%d %b") if o["due"] else "-"
        print(f"{o['key']} [{o['status']}] {o['priority']} dev={'/'.join(o['dev']) or '-'} mod={'/'.join(o['module']) or '-'} env={'/'.join(o['env']) or '-'} due={due} | {o['title']} | {', '.join(o['assignees']) or '(unassigned)'} | raised {o['raised']} ({o['raised_from']}) | open {o['open_days']}d | {' '.join(o['slack']) or 'NO-THREAD'} | {' '.join(o['other'])}")

def split(path, max_chars=4700):
    s = open(path, encoding="utf-8").read()
    parts, cur = [], ""
    for ln in s.split("\n"):
        if cur and len(cur) + len(ln) + 1 > max_chars:
            parts.append(cur); cur = ln
        else:
            cur = (cur + "\n" + ln) if cur else ln
    parts.append(cur)
    d = os.path.dirname(os.path.abspath(path))
    for i, c in enumerate(parts, 1):
        open(os.path.join(d, f"part{i}.txt"), "w", encoding="utf-8").write(c)
        print(f"part{i}.txt {len(c)} chars")

if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "--split":
        split(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 4700)
    elif len(sys.argv) == 2:
        condense(sys.argv[1])
    else:
        print(__doc__); sys.exit(1)
