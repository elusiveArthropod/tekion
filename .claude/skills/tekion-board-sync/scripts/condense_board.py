#!/usr/bin/env python3
"""Condense saved fetch_issues pages into one line per issue.

Usage: python3 -I condense_board.py <page1.txt> [<page2.txt> ...] > board.txt

Each input is a saved fetch_issues result: either the raw JSON object
({"rows": [...]}) or the wrapped form ([{"type": "text", "text": "..."}]).
Writes board.txt-style lines to stdout and board-ids.json next to the first
input, mapping each key to {id, version, statusId, assignees, title}. The
version is what update_issue's expectedVersion needs.
"""
import datetime
import json
import os
import sys

PRI = {0: "-", 1: "low", 2: "med", 3: "HIGH", 4: "URG"}


def load(path):
    raw = json.load(open(path, encoding="utf-8"))
    if isinstance(raw, list):
        raw = json.loads(raw[0]["text"])
    return raw["rows"]


def day(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%m-%d")


def main(paths):
    rows = []
    for p in paths:
        rows += load(p)
    seen = {}
    for r in rows:
        seen[r["id"]] = r
    rows = list(seen.values())
    out = []
    ids = {}
    for r in rows:
        p = r["properties"]
        key = p["identifier"]
        parent = "P:" + p["parentIssueId"][-6:] if p.get("parentIssueId") else "      "
        names = ", ".join(r.get("assigneeNames") or [])[:40]
        out.append((p["sequenceNumber"],
                    f'{key:8} {r["statusName"]:17} {PRI.get(p.get("priority", 0), "?"):4} '
                    f'upd={day(r["modifiedTime"])} crt={day(r["createdTime"])} {parent} '
                    f'sub={r.get("subIssueCount", 0)} c={r.get("commentCount", 0)} | {names:40} | {p["title"][:95]}'))
        ids[key] = {"id": r["id"], "version": r["version"], "statusId": p["statusId"],
                    "projectId": p.get("projectId", ""), "assignees": r.get("assignees"),
                    "title": p["title"]}
    out.sort(reverse=True)
    print("\n".join(line for _, line in out))
    dest = os.path.join(os.path.dirname(os.path.abspath(paths[0])), "board-ids.json")
    json.dump(ids, open(dest, "w"), indent=1)
    print(f"\n# {len(rows)} issues; ids and versions in {dest}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
