#!/usr/bin/env python3
"""Condense a saved slack_read_channel result into one line per message.

Usage: python3 -I condense_slack.py <saved-tool-result.txt> > timeline.txt

The saved file is the JSON the Slack MCP tool returns ({"messages": "..."}).
Output: for each message, a header line with timestamp, author, Slack ts and
reply count, then the first 700 characters of the text. Thread ts values are
what slack_read_thread needs.
"""
import json
import re
import sys


def main(path):
    data = json.load(open(path, encoding="utf-8"))
    text = data["messages"] if isinstance(data, dict) else data
    parts = re.split(r"\n=== Message from ", text)
    print(parts[0][:200].strip())
    print(f"messages: {len(parts) - 1}")
    for part in parts[1:]:
        head, _, body = part.partition("\n")
        m = re.match(r"(.*?) <[^>]*> \((U\w+)\) at ([\d-]+ [\d:]+) IST", head)
        who, when = (m.group(1), m.group(3)) if m else (head[:40], "?")
        ts = re.search(r"Message TS: (\S+)", body)
        ts = ts.group(1) if ts else "?"
        body = re.sub(r"Message TS: \S+\n?", "", body)
        replies = re.search(r"(\d+) repl", body)
        flat = re.sub(r"\s+", " ", body).strip()
        tag = f" THREAD:{replies.group(0)}" if replies else ""
        print(f"\n--- [{when}] {who} ts={ts}{tag}\n{flat[:700]}")


if __name__ == "__main__":
    main(sys.argv[1])
