"""Create/update test cases from a definitions module and (optionally) run them.

usage: UA_COOKIE=... python3 run_cases.py <module> [--run] [--only substring] [--registry file]
"""
import importlib
import json
import os
import sys
import time

import ua_api

args = sys.argv[1:]
mod = importlib.import_module(args[0])
run = "--run" in args
only = args[args.index("--only") + 1] if "--only" in args else None
reg_path = args[args.index("--registry") + 1] if "--registry" in args else "registry.json"
registry = json.load(open(reg_path)) if os.path.exists(reg_path) else {}

existing = {c["name"]: c["id"] for c in ua_api.list_test_cases()}
results = []
for tc in mod.CASES:
    name = tc["name"]
    if only and only not in name:
        continue
    tc_id = registry.get(name) or existing.get(name)
    if tc_id:
        cur = ua_api.get_test_case(tc_id)
        cur["name"] = name
        cur["properties"] = tc["properties"]
        if tc.get("description"): cur["description"] = tc["description"]
        if tc.get("tags"): cur["tags"] = tc["tags"]
        saved = ua_api.save_test_case(cur)
    else:
        saved = ua_api.save_test_case(tc)
    tc_id = saved["id"]
    registry[name] = tc_id
    json.dump(registry, open(reg_path, "w"), indent=1)
    line = f"{name}: id={tc_id} v{saved.get('version')}"
    if run:
        run_id = ua_api.execute_test_case(tc_id)
        status, ent = ua_api.wait_for_run(tc_id, run_id)
        det = ua_api.run_details(run_id)
        failed = det.get("FAILED_NODES")
        line += f" -> {status} run={run_id} failed_nodes={failed}"
        results.append((name, status, run_id, failed))
    print(line, flush=True)

if run:
    print("\nSUMMARY")
    for r in results:
        print(f"  {r[1]:7} {r[0]}  ({r[2]}) {r[3] or ''}")
