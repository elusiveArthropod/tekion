"""Create or update the test suites (and a test plan) from registry.json.

usage: UA_COOKIE=... python3 make_suites.py [--run]
"""
import json
import sys

import ua_api

registry = json.load(open("registry.json"))

SUITES = [
    ("FV-1 Input guards", "G-", "Mode, batch_id and file guards of the callable trigger. No storage access."),
    ("FV-2 Submit batch guards", "B-", "Batch lookup, already-submitted, issues vs force_submit, org hierarchy, write-count checks. All storage mocked."),
    ("FV-3 Submit new deals", "D-", "Rows with no stored deal: BR-01..BR-08 schedule building, amount parsing, duplicates, employee normalisation. All storage mocked."),
    ("FV-4 Submit stored deals and transitions", "E-", "Matching to stored deals, allowed and invalid status transitions, idempotent re-upload, BR-05/06/07/09 cancellations and catch-up. All storage mocked."),
    ("FV-5 Submit scopes and audit trail", "F-", "_2025_prior, _2026_future, _lawrence scopes and the per-deal audit trail versions. All storage mocked."),
    ("FV-6 Validate file rules", "V-", "Validate mode with real Excel fixtures: required fields, amounts, dates, duplicates, employees, synonyms, empty file. Staging writes mocked."),
    ("FV-7 Validate against stored deals", "W-", "Validate mode transitions against mocked stored deals, 2025_prior scope, and the errors Excel on a mixed file."),
]


def main():
    run = "--run" in sys.argv
    existing = {s["name"]: s for s in ua_api.search_suites()}
    suite_ids = []
    for name, prefix, desc in SUITES:
        ids = [tid for n, tid in sorted(registry.items()) if n.startswith(prefix)]
        suite = existing.get(name)
        if suite:
            suite["description"] = desc
            suite["testCaseIds"] = ids
        else:
            suite = {"name": name, "description": desc, "assetId": ua_api.ASSET_ID, "assetClass": ua_api.ASSET_CLASS,
                     "testCaseIds": ids}
        saved = ua_api.save_suite(suite)
        suite_ids.append(saved["id"])
        print(f"{name}: id={saved['id']} cases={len(saved.get('testCaseIds', []))}")
        if run:
            print("   run ->", ua_api.execute_suite(saved["id"]))
    # test plan (best effort)
    try:
        plans = ua_api.call("POST", "/api/unit-test/test-plan/search", {"assetId": ua_api.ASSET_ID}).get("objects", [])
    except Exception as e:
        plans = []
        print("plan search failed:", str(e)[:120])
    plan = next((p for p in plans if p.get("name") == "FV File Validation regression"), None)
    body = plan or {"name": "FV File Validation regression", "assetId": ua_api.ASSET_ID, "assetClass": ua_api.ASSET_CLASS,
                    "description": "All File Validation suites."}
    body["testSuiteIds"] = suite_ids
    try:
        saved = ua_api.call("POST", "/api/unit-test/test-plan", {"testPlan": body})
        print("plan:", saved.get("id"), saved.get("name"), len(saved.get("testSuiteIds", [])))
    except Exception as e:
        print("plan create failed:", str(e)[:200])


if __name__ == "__main__":
    main()
