"""Thin client for the UnifyApps unit-test API used by the File Validation test suite.

Auth: the `_at` session cookie, read from the UA_COOKIE environment variable.
Host: UA_HOST (default finance.toc.tekioncloud.xyz).
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

HOST = os.environ.get("UA_HOST", "https://finance.toc.tekioncloud.xyz")
COOKIE = os.environ.get("UA_COOKIE", "")
ASSET_ID = "6a86c96bbcd82c7b30a8e63f"  # File Validation - preview
ASSET_CLASS = "WORKFLOW_DEFINITION"


def call(method, path, body=None, raw=False):
    if not COOKIE:
        sys.exit("UA_COOKIE is not set (value of the _at cookie)")
    data = None
    headers = {"Cookie": f"_at={COOKIE}", "Accept": "*/*"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(HOST + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            txt = r.read().decode()
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {txt[:500]}")
    if raw or not txt:
        return txt
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        return txt


# ---- test cases -----------------------------------------------------------

def get_test_case(tc_id):
    return call("GET", f"/api/unit-test/test-case/{tc_id}")


def save_test_case(tc):
    """Create (no id) or update (with id) a test case. Returns the stored entity."""
    return call("POST", "/api/unit-test/test-case", {"testCase": tc})


def delete_test_cases(ids):
    return call("POST", "/api/unit-test/test-case/delete", list(ids))


def list_test_cases():
    body = {
        "entityType": "UnitTestCase", "group": "STANDARD",
        "projections": [{"name": "id"}, {"name": "name"}, {"name": "lastRunStatus"}, {"name": "mTm"}],
        "filter": {"op": "AND", "values": [{"field": "assetId", "op": "EQUAL", "values": [ASSET_ID]}]},
        "page": {"limit": 500, "offset": 0},
    }
    res = call("POST", "/api/aggregation?entityType=UnitTestCase&group=STANDARD", body)
    return [o["columns"] for o in res.get("objects", [])]


def execute_test_case(tc_id):
    return call("POST", f"/api/unit-test/execute/test-case/{tc_id}", {})["runId"]


def wait_for_run(tc_id, run_id, timeout=300):
    t0 = time.time()
    while time.time() - t0 < timeout:
        tc = get_test_case(tc_id)
        lr = tc.get("lastRunResult") or {}
        if lr.get("runId") == run_id and lr.get("status") in ("PASSED", "FAILED", "ERROR", "CANCELLED"):
            return lr.get("status"), tc
        time.sleep(3)
    return "TIMEOUT", get_test_case(tc_id)


def run_details(run_id):
    body = {
        "entityType": "WORKFLOW_EXECUTION", "group": "UNIT_TEST_WORKFLOW_EXECUTION",
        "projections": [{"name": "START_TIME"}, {"name": "END_TIME"}, {"name": "STATUS"}, {"name": "ID"},
                        {"name": "EXECUTION_TIME"}, {"name": "DEPLOYED_WORKFLOW_ID"}, {"name": "FAILED_NODES"}],
        "filter": {"op": "IN", "field": "ID", "values": [run_id]},
        "page": {"limit": 1, "offset": 0},
    }
    res = call("POST", "/api/aggregation?entityType=WORKFLOW_EXECUTION&group=UNIT_TEST_WORKFLOW_EXECUTION", body)
    objs = res.get("objects", [])
    return objs[0]["columns"] if objs else {}


def node_executions(run_id, deployed_workflow_id):
    proj = [{"name": "CURRENT_NODE_ID", "aggregationFunction": "GROUP"},
            {"name": "ENTRY_TIME", "aggregationFunction": "MAX"}]
    for n in ("STATUS", "EXIT_TIME", "SKIPPED"):
        proj.append({"name": n, "aggregationFunction": "MAX_BY", "additional": {"AGGREGATE_BY": "ENTRY_TIME"}})
    body = {"aggregationQuery": {
        "entityType": "WORKFLOW_NODE_EXECUTION", "group": "UNIT_TEST_WORKFLOW_EXECUTION",
        "projections": [{"name": "CURRENT_NODE_ID", "projections": proj}],
        "filter": {"op": "AND", "values": [
            {"op": "IN", "field": "DEPLOYED_WORKFLOW", "values": [deployed_workflow_id]},
            {"op": "IN", "field": "ROOT_EXECUTION_INSTANCE_ID", "values": [run_id]}]},
        "page": {"limit": 500, "offset": 0}}}
    res = call("POST", "/api/workflow-runs/node-executions", body)
    out = []
    for o in res.get("objects", []):
        nid = o["columns"]["CURRENT_NODE_ID"]
        p = (o.get("projections") or [{}])[0].get("columns", {})
        out.append((nid, p.get("STATUS"), p.get("ENTRY_TIME")))
    out.sort(key=lambda x: x[2] or 0)
    return out


# ---- suites / plans ---------------------------------------------------------

def search_suites():
    return call("POST", "/api/unit-test/test-suite/search", {"assetId": ASSET_ID}).get("objects", [])


def save_suite(suite):
    return call("POST", "/api/unit-test/test-suite", {"testSuite": suite})


def delete_suites(ids):
    return call("POST", "/api/unit-test/test-suite/delete", list(ids))


def execute_suite(suite_id):
    return call("POST", f"/api/unit-test/execute/test-suite/{suite_id}", {})
