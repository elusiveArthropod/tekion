import json, sys, urllib.request, os
HOST = os.environ.get("UA_HOST", "finance.toc.tekioncloud.xyz")
COOKIE = os.environ["UA_AT"]
def call(server, method, params=None, sid=None, rid=1):
    req = urllib.request.Request(f"https://{HOST}/llm-tools/mcp/{server}", method="POST",
        data=json.dumps({"jsonrpc":"2.0","id":rid,"method":method,"params":params or {}}).encode(),
        headers={"Cookie": f"_at={COOKIE}", "Origin": f"https://{HOST}", "Content-Type":"application/json", "Accept":"application/json, text/event-stream", **({"Mcp-Session-Id": sid} if sid else {})})
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read().decode(); sid2 = r.headers.get("Mcp-Session-Id")
    if body.startswith("event:") or "\ndata:" in body or body.startswith("data:"):
        data = [json.loads(l[5:]) for l in body.splitlines() if l.startswith("data:")]
        return (data[-1] if data else {}), sid2
    return (json.loads(body) if body.strip() else {}), sid2
def session(server):
    init, sid = call(server, "initialize", {"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"sentinel-build","version":"0"}})
    try: call(server, "notifications/initialized", sid=sid)
    except Exception: pass
    return sid
def tools(server):
    sid = session(server); res, _ = call(server, "tools/list", sid=sid, rid=2)
    return res.get("result", {}).get("tools", []), sid
def tool_call(server, name, args):
    sid = session(server)
    res, _ = call(server, "tools/call", {"name": name, "arguments": {"host": HOST, **args}}, sid=sid, rid=3)
    txt = json.dumps(res)
    if 'Unrecognized key: "host"' in txt or "Unrecognized key: \\\"host\\\"" in txt:
        res, _ = call(server, "tools/call", {"name": name, "arguments": args}, sid=sid, rid=4)
    return res
if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "list":
        for s in sys.argv[2:]:
            try:
                ts, _ = tools(s); print(f"=== {s}: {len(ts)} tools")
                for t in ts: print(f"- {t['name']}: {t.get('description','')[:150].replace(chr(10),' ')}")
            except Exception as e: print(f"=== {s}: ERROR {e}")
    elif cmd == "schema":
        ts, _ = tools(sys.argv[2]); print(json.dumps([t for t in ts if t["name"] in sys.argv[3:]], indent=1))
    elif cmd == "call":
        print(json.dumps(tool_call(sys.argv[2], sys.argv[3], json.loads(sys.argv[4])), indent=1)[:int(os.environ.get("MAXOUT","6000"))])
