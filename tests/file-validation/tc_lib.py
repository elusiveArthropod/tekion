"""Builders for File Validation test cases (UnifyApps unit-test entities)."""
import copy

from ua_api import ASSET_ID, ASSET_CLASS

TRIGGER = "n_xZzvt"

# Node ids of the automation (File Validation - preview, v30)
N = dict(
    trigger="n_xZzvt", invalid_mode="n_58m3o", no_batch="n_9u8s2",
    fetch_batch="n_lnxbo", check_batch="n_ebfzb", batch_not_found="n_ursxg", already_submitted="n_nhin3",
    submit_with_errors="n_sartn", fetch_hierarchy="n_1o7pp", fetch_existing="n_mud6m", fetch_versions="n_37rpj",
    match="n_2g2h1", hierarchy_empty="n_a8dac", bulk_update="n_v18s1", flag_update="n_8ml28", bulk_create="n_dmgy9",
    not_all_written="n_oft49", mark_batch="n_aal34", audit="n_eb2z7", upload_record="n_npdqi", submitted="n_wfkud",
    no_file="n_ro4d9", first_pass_keys="n_lthvv", cross_checks="n_iugga", fetch_stored="n_xyhod",
    validate_batch="n_b1zb9", save_logs="n_5eb4r", summary="n_e9f5c", html="n_e7lxw", html_short="n_plpfx",
    errors_excel="n_w8vza", file_objs_err="n_hqmhz", upload_rec_err="n_wagp5", respond_errors="n_sca88",
    file_objs_ok="n_bvbtn", upload_rec_ok="n_kdqg5", respond_ok="n_Nh7FV",
)


# ---- assertions -------------------------------------------------------------

def _a(nid, i, data, op, expected=None):
    a = {"type": "DATA", "id": f"{i}_assert-{nid}", "data": data, "op": op}
    if expected is not None:
        a["expectedValue"] = str(expected)
    return a


def eq(path, v):        return ("EQUAL", path, v)
def ne(path, v):        return ("NOT_EQUAL", path, v)
def contains(path, v):  return ("CONTAINS", path, v)
def ncontains(path, v): return ("NOT_CONTAINS", path, v)
def starts(path, v):    return ("STARTS_WITH", path, v)
def gt(path, v):        return ("GT", path, v)
def lt(path, v):        return ("LT", path, v)
def exists(path):       return ("EXISTS", path, None)
def missing(path):      return ("MISSING", path, None)


def node(nid, mock=None, error_mock=None, verify="success", asserts=(), verify_error=None):
    """One nodeTestCases entry.

    mock: dict -> the step is mocked with this output.
    error_mock: dict -> the step is mocked to fail (ERROR_MOCK).
    verify: 'success' | 'failure' | None  -> step-status assertion.
    asserts: list of (op, path, expected); path is relative to the node outputs
             ("result.count") or absolute ("{{ n_x.outputs.y }}").
    """
    entry = {}
    if error_mock is not None:
        entry["type"] = "ERROR_MOCK"
        entry["mockedOutput"] = error_mock
    elif mock is not None:
        entry["type"] = "MOCK"
        entry["mockedOutput"] = mock
    else:
        entry["type"] = "NO_MOCK"
    al = []
    if verify == "success":
        al.append({"type": "VERIFY_CALL", "shouldExecute": True, "id": f"verify_assert-{nid}"})
    elif verify == "failure":
        f = {"type": "STEP_FAILURE", "id": f"stepfailure_assert-{nid}"}
        if verify_error:
            f["errorMsg"] = verify_error
        al.append(f)
    for i, (op, path, expected) in enumerate(asserts):
        data = path if path.startswith("{{") else "{{ %s.outputs.%s }}" % (nid, path)
        al.append(_a(nid, i, data, op, expected))
    if al:
        entry["assertions"] = al
    return nid, entry


def trigger(mode=None, batch_id=None, excel=None, page_setup=None):
    out = {}
    if mode is not None: out["mode"] = mode
    if batch_id is not None: out["batch_id"] = batch_id
    if excel is not None: out["Excel"] = excel
    if page_setup is not None: out["page_setup"] = page_setup
    return node(TRIGGER, mock=out, verify=None)


def fetch(objects, cursor=False):
    out = {"objects": objects, "hasMore": False}
    if cursor:
        out["cursor"] = {"next": ""}
    return out


def test_case(name, nodes, description=None, tags=None):
    ntc = {}
    for nid, entry in nodes:
        if nid in ntc:  # later entry wins for mock/type, assertions are merged (by id)
            cur = ntc[nid]
            merged = {a["id"]: a for a in cur.get("assertions", [])}
            for a in entry.get("assertions", []):
                merged[a["id"]] = a
            cur.update({k: v for k, v in entry.items() if k != "assertions"})
            if merged:
                cur["assertions"] = list(merged.values())
            continue
        ntc[nid] = entry
    tc = {"name": name, "assetId": ASSET_ID, "assetClass": ASSET_CLASS,
          "properties": {"type": "WORKFLOW", "nodeTestCases": ntc}}
    if description:
        tc["description"] = description
    if tags:
        tc["tags"] = tags
    return tc


# ---- data factories ---------------------------------------------------------

def upload_row(**kw):
    """A staged row as stored by validate in commission_amotization_logs_.rows."""
    r = dict(row_number="2", plan_name="Sales Plan 2026", period_group_name="Q1 2026", payout_date="2026-11-15",
             employee_id="E1001", employee_first_name="Ava", employee_last_name="Stone",
             employee_start_date="2024-01-10", employee_end_date="", tekion_id="TK-0001",
             dealer_name="Sunrise Motors", product="ARC", sku_id="SKU-ARC-1", currency="USD",
             product_status="live", go_live_date="2026-09-01", signed_date="2026-08-15",
             total_commission_calculated="3600", total_commission_paid="3600", total_commission_payable="3600",
             commission_paid_prior="0", commission_due_this_payout="100", total_commission_due="100",
             is_live="true", has_issues="false", issues="")
    r.update(kw)
    return r


def batch_chunk(rows, batch_id="B-TEST", status="validated", has_issues=None, id="log-1"):
    if has_issues is None:
        has_issues = "true" if any(r.get("has_issues") == "true" for r in rows) else "false"
    return {"id": id, "properties": {"batch_id": batch_id, "status": status, "has_issues": has_issues,
                                     "chunk_no": 1, "row_count": len(rows), "rows": rows}}


def hierarchy(*emp_ids):
    return [{"id": f"h-{i}", "properties": {"employeeID": e}} for i, e in enumerate(emp_ids, 1)]


def existing_deal(id="deal-1", schedule=None, **kw):
    """A stored commission_amotizations record (one per deal, schedule inside)."""
    p = dict(Tekion_ID="TK-0001", Dealer_Name="Sunrise Motors", SKU_ID="SKU-ARC-1", Employee_ID="E1001",
             Product_Status="signed", Go_Live_Date="", Remaining_Balance="3600", deal_key="",
             Commission_Calc_at_80_Percent="", Total_Commission_Calculated="3600", Total_Commission_Paid="3600",
             Notes="", Plan_Name="Sales Plan 2026", Period_Group_Name="Q1 2026", Payout_Date="2026-11-15",
             Employee_First_Name="Ava", Employee_Last_Name="Stone", Employee_Start_Date="2024-01-10",
             Employee_End_Date="", Product="ARC", Currency="USD", Signed_Date="2026-08-15",
             Sequence_for_filter="1", EE_Look_up="E1001", Order_form_type="", Q_R_U="",
             Commission_Paid_in_Prior_Payouts="0", Commission_Due_This_Payout="100", Total_Commission_Due="100",
             EE_Active="Active", Investigate="")
    p.update(kw)
    p["schedule"] = schedule or []
    return {"id": id, "properties": p}


def schedule_36(total, first_month):
    """36 straight-line schedule entries. first_month = 'YYYY-MM' of month 1."""
    y, m = int(first_month[:4]), int(first_month[5:7])
    out = []
    monthly = total / 36.0
    for i in range(1, 37):
        mm = m + i - 1
        yy = y + (mm - 1) // 12
        mm = (mm - 1) % 12 + 1
        cum = round(monthly * i, 10) if i < 36 else float(total)
        out.append({"m": i, "month": f"{yy:04d}-{mm:02d}", "n": round(monthly, 10), "cum": cum,
                    "bal": round(float(total) - cum, 10)})
    return out


# Mocks for every node in the submit path that writes to storage.
def submit_write_mocks(updated=0, inserted=0, failed=0):
    return [
        node(N["bulk_update"], mock={"updated": updated, "failedCount": failed}, verify=None),
        node(N["flag_update"], mock={"updated": 0, "failedCount": 0}, verify=None),
        node(N["bulk_create"], mock={"inserted": inserted}, verify=None),
        node(N["mark_batch"], mock={"updated": 1, "failedCount": 0}, verify=None),
        node(N["audit"], mock={"upserted": 1}, verify=None),
        node(N["upload_record"], mock={"id": "B-TEST"}, verify=None),
    ]


def submit_read_mocks(batch_rows, hier=None, existing=None, versions=None):
    if hier is None:
        hier = hierarchy("E1001", "E1002")
    return [
        node(N["fetch_batch"], mock=fetch(batch_rows), verify=None),
        node(N["fetch_hierarchy"], mock=fetch(hier, cursor=True), verify=None),
        node(N["fetch_existing"], mock=fetch(existing or []), verify=None),
        node(N["fetch_versions"], mock=fetch(versions or []), verify=None),
    ]
