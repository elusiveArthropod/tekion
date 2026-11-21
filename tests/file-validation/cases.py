"""Test cases for the 'File Validation - preview' automation (commission amortization uploads).

Every test mocks the trigger and every storage read/write node it touches, so runs never
write to commission_amotizations, the logs, the audit trail or the upload record.
Groovy/JS/variable nodes run for real. Validate-path tests use real Excel fixtures that
upload_fixtures.py put in cloud storage (files.json).
"""
import datetime as _dt
import json

from tc_lib import *

FILES = json.load(open("files.json"))


def xl(name):
    return FILES[name]


def months_ago(n):
    """First day of the month n months before now (the automation uses Asia/Kolkata 'now')."""
    today = _dt.date.today()
    y, m = today.year, today.month - n
    while m <= 0:
        y, m = y - 1, m + 12
    return f"{y:04d}-{m:02d}-01"


def month_after(ymd):
    y, m = int(ymd[:4]), int(ymd[5:7]) + 1
    if m == 13:
        y, m = y + 1, 1
    return f"{y:04d}-{m:02d}"


R = "result."
SUB_MSG_OK = "Batch submitted."

CASES = []


def add(name, nodes, description=None):
    CASES.append(test_case(name, nodes, description))


# =============================================================================
# G. Input guards (mode / batch_id / file)
# =============================================================================
add("G-01 Unknown mode is rejected", [
    trigger(mode="publish"),
    node(N["invalid_mode"], asserts=[eq("isIssues", "Invalid mode"), eq("submitted", "false"),
                                     contains("message", "mode must be validate, submit or force_submit")]),
])
add("G-02 Mode with an unknown suffix is rejected", [
    trigger(mode="submit_2027_future"),
    node(N["invalid_mode"], asserts=[eq("isIssues", "Invalid mode")]),
])
add("G-03 Mode check is case sensitive (Validate is rejected)", [
    trigger(mode="Validate"),
    node(N["invalid_mode"], asserts=[eq("isIssues", "Invalid mode")]),
])
add("G-04 submit without batch_id is refused", [
    trigger(mode="submit"),
    node(N["no_batch"], asserts=[eq("isIssues", "No batch id"), eq("submitted", "false"), eq("mode", "submit"),
                                 contains("message", "batch_id is required")]),
])
add("G-05 force_submit_2025_prior without batch_id is refused", [
    trigger(mode="force_submit_2025_prior"),
    node(N["no_batch"], asserts=[eq("isIssues", "No batch id"), eq("mode", "force_submit_2025_prior")]),
])
add("G-06 validate without a file is refused", [
    trigger(mode="validate"),
    node(N["no_file"], asserts=[eq("isIssues", "No file uploaded"), eq("message", "No file uploaded")]),
])
add("G-07 validate_lawrence suffix is accepted (reaches the file check)", [
    trigger(mode="validate_lawrence"),
    node(N["no_file"], asserts=[eq("isIssues", "No file uploaded")]),
])
add("G-08 GAP: missing mode is not rejected, it falls through to validate", [
    trigger(),
    node(N["no_file"], asserts=[eq("isIssues", "No file uploaded")]),
], "Documents current behaviour: with no mode the run is treated as validate instead of 'Invalid mode'.")

# =============================================================================
# B. Submit: batch state guards
# =============================================================================
add("B-01 Batch not found", [
    trigger(mode="submit", batch_id="B-NONE"),
    *submit_read_mocks([]),
    node(N["check_batch"], asserts=[eq(R + "count", 0), eq(R + "already_submitted", "false"), eq(R + "issue_rows", 0)]),
    node(N["batch_not_found"], asserts=[eq("isIssues", "Batch not found"), eq("submitted", "false"), eq("batch_id", "B-NONE"),
                                        contains("message", "Run validate again")]),
])
add("B-02 Batch already submitted is not written again", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()], status="submitted")]),
    node(N["check_batch"], asserts=[eq(R + "count", 1), eq(R + "already_submitted", "true")]),
    node(N["already_submitted"], asserts=[eq("isIssues", "Already submitted"), eq("submitted", "false")]),
])
add("B-03 Plain submit of a batch with issues is refused", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(), upload_row(row_number="3", tekion_id="TK-0002", has_issues="true",
                                                           issues="Unknown product status: x")])]),
    node(N["check_batch"], asserts=[eq(R + "count", 2), eq(R + "issue_rows", 1), eq(R + "has_issues", "true")]),
    node(N["submit_with_errors"], asserts=[eq("isIssues", "true"), eq("issue_rows", 1), eq("submitted", "false"),
                                           contains("message", "use force_submit")]),
])
add("B-04 force_submit of a batch with issues proceeds and skips the invalid row", [
    trigger(mode="force_submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(), upload_row(row_number="3", tekion_id="TK-0002", product_status="pending",
                                                           has_issues="true", issues="Unknown product status: pending")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "deals_created", 1), eq(R + "records_created", 1),
                              eq(R + "final_status", "force_submitted")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("isIssues", "true"), eq("issue_rows", 1),
                                  eq("rows_skipped_invalid", 1), eq("deals_created", 1), eq("mode", "force_submit")]),
])
add("B-05 Empty org hierarchy stops the submit", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], hier=[]),
    node(N["match"], asserts=[eq(R + "hierarchy_ok", "false"), eq(R + "written_records", 0)]),
    node(N["hierarchy_empty"], asserts=[eq("isIssues", "Org hierarchy empty"), eq("submitted", "false"),
                                        contains("message", "Nothing was written")]),
])
add("B-06 Create count mismatch leaves the batch unsubmitted", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])]),
    *submit_write_mocks(inserted=0),
    node(N["match"], asserts=[eq(R + "records_created", 1)]),
    node(N["not_all_written"], asserts=[eq("submitted", "false"), eq("written_records", 0),
                                        contains("message", "could not be written")]),
])
add("B-07 Failed updates leave the batch unsubmitted", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="signed")]),
    *submit_write_mocks(updated=1, failed=1),
    node(N["match"], asserts=[eq(R + "records_updated", 1)]),
    node(N["not_all_written"], asserts=[eq("submitted", "false"), eq("rows_updated", 1)]),
])

# =============================================================================
# D. Submit: new deals
# =============================================================================
add("D-01 New live deal gets a 36 month schedule from the month after go-live (BR-01)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])]),
    *submit_write_mocks(inserted=1),
    node(N["check_batch"], asserts=[eq(R + "count", 1), eq(R + "has_issues", "false"), eq(R + "tekion_ids[0]", "TK-0001")]),
    node(N["match"], asserts=[
        eq(R + "deals_created", 1), eq(R + "live_deals", 1), eq(R + "non_live_rows", 0), eq(R + "written_records", 36),
        eq(R + "records_created", 1), eq(R + "records_updated", 0), eq(R + "hierarchy_ok", "true"),
        eq(R + "chunks[0].records[0].deal_key", "sunrisemotors|tk-0001|sku-arc-1"),
        eq(R + "chunks[0].records[0].Product_Status", "live"), eq(R + "chunks[0].records[0].EE_Active", "Active"),
        eq(R + "chunks[0].records[0].Remaining_Balance", "0"),
        eq(R + "chunks[0].records[0].schedule[0].m", 1), eq(R + "chunks[0].records[0].schedule[0].month", "2026-10"),
        eq(R + "chunks[0].records[0].schedule[35].m", 36), eq(R + "chunks[0].records[0].schedule[35].month", "2029-09"),
        contains(R + "chunks[0].records[0].Notes", "BR-01: Product status live, EE Active"),
        eq(R + "deal_versions_written", 1), eq(R + "final_status", "submitted"), eq(R + "deal_scope", ""),
        eq(R + "audit_chunks[0].records[0].version", "v1"), eq(R + "audit_chunks[0].records[0].entry.rows_added", 36)]),
    node(N["bulk_create"], mock={"inserted": 1}),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_created", 1), eq("written_records", 1),
                                  eq("live_deals_amortized", 1), eq("non_live_rows_written", 0), eq("isIssues", "false"),
                                  eq("deal_versions_written", 1), eq("invalid_transitions", 0), starts("message", SUB_MSG_OK)]),
])
add("D-02 New live deal without go-live date is not amortized (BR-08)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(go_live_date="")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "live_deals", 0), eq(R + "non_live_rows", 1), eq(R + "written_records", 1),
                              eq(R + "chunks[0].records[0].Remaining_Balance", "3600"),
                              contains(R + "chunks[0].records[0].Notes", "BR-08: Live but no go-live date")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("non_live_rows_written", 1), eq("live_deals_amortized", 0)]),
])
add("D-03 New signed deal: no amortization, calc held in Remaining_Balance (BR-02)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed", is_live="false")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "non_live_rows", 1), eq(R + "written_records", 1), eq(R + "deals_created", 1),
                              eq(R + "chunks[0].records[0].Product_Status", "signed"),
                              eq(R + "chunks[0].records[0].Remaining_Balance", "3600"),
                              contains(R + "chunks[0].records[0].Notes", "BR-02: Signed, not live")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("non_live_rows_written", 1)]),
])
add("D-04 New deal with blank status is written without a Product_Status field (BR-08)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="", is_live="false")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "blank_status_rows", 1), eq(R + "non_live_rows", 1), eq(R + "written_records", 1),
                              missing(R + "chunks[0].records[0].Product_Status"),
                              contains(R + "chunks[0].records[0].Notes", "BR-08: Status blank")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("blank_status_rows", 1)]),
], "Observation: the created record has no Product_Status key (blank values are dropped), so a later upload treats it as 'signed'.")
add("D-05 Live row without payable or paid amount is skipped", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(total_commission_payable="", total_commission_paid="")])]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "deals_created", 0), eq(R + "written_records", 0),
                              contains(R + "invalid_text", "Total Commission Payable and Total Commission Paid are both blank")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1), eq("written_records", 0),
                                  contains("invalid_transition_details", "nothing written")]),
])
add("D-06 Live row with only Total Commission Paid uses it as the total", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(total_commission_payable="", total_commission_paid="1800")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "live_deals", 1), eq(R + "written_records", 36),
                              eq(R + "chunks[0].records[0].Total_Commission_Paid", "1800"),
                              eq(R + "chunks[0].records[0].schedule[35].cum", 1800)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("live_deals_amortized", 1)]),
])
add("D-07 Amounts with currency symbols, commas and parentheses are parsed", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(total_commission_payable="$7,200.00", total_commission_paid="(7,200)",
                                                go_live_date="9/1/2026")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "live_deals", 1), eq(R + "chunks[0].records[0].schedule[35].cum", 7200),
                              eq(R + "chunks[0].records[0].schedule[0].month", "2026-10")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
])
add("D-08 Signed lost with active employee: nothing on the balance sheet (BR-03)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed_lost", is_live="false")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "non_live_rows", 1), eq(R + "written_records", 1),
                              eq(R + "chunks[0].records[0].Product_Status", "signed_lost"),
                              eq(R + "chunks[0].records[0].Remaining_Balance", "0"),
                              contains(R + "chunks[0].records[0].Notes", "BR-03: Signed lost, EE Active")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("non_live_rows_written", 1)]),
])
add("D-09 Signed lost with inactive employee expenses paid amount in the upload month (BR-04)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed_lost", is_live="false", employee_id="E9999")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "non_live_rows", 1), eq(R + "written_records", 1),
                              eq(R + "chunks[0].records[0].EE_Active", "Inactive"),
                              eq(R + "chunks[0].records[0].schedule[0].m", 1), eq(R + "chunks[0].records[0].schedule[0].n", 3600),
                              eq(R + "chunks[0].records[0].schedule[0].bal", 0),
                              contains(R + "chunks[0].records[0].Notes", "BR-04: Signed lost, EE Inactive")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
])
add("D-10 Signed lost with inactive employee and no paid amount is skipped", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed_lost", is_live="false", employee_id="E9999",
                                                total_commission_paid="", total_commission_payable="")])]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "written_records", 0),
                              contains(R + "invalid_text", "sign lost amount cannot be decided")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1)]),
])
OLD = months_ago(17)
RECENT = months_ago(3)
add("D-11 New cancelled deal more than 12 months after go-live: schedule up to the cancellation month (BR-06)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=OLD)])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "live_deals", 1), eq(R + "deals_created", 1), gt(R + "written_records", 12), lt(R + "written_records", 37),
                              eq(R + "chunks[0].records[0].Product_Status", "cancelled"), eq(R + "chunks[0].records[0].Remaining_Balance", "0"),
                              contains(R + "chunks[0].records[0].Notes", "BR-06: Cancelled after 12 months of go-live, EE Active")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("live_deals_amortized", 1)]),
], f"Go-live {OLD} (17 months before generation). Regenerate with run_cases.py when the fixture ages past 36 months.")
add("D-12 New cancelled deal within 12 months, active employee: earlier amortization reversed (BR-07)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=RECENT)])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "deals_created", 1), gt(R + "written_records", 0), lt(R + "written_records", 13),
                              contains(R + "chunks[0].records[0].Notes", "BR-07: Cancelled within 12 months of go-live, EE Active"),
                              contains(R + "chunks[0].records[0].Notes", "reversed")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
], f"Go-live {RECENT} (3 months before generation). Valid while that is within 12 months of the run.")
add("D-13 New cancelled deal within 12 months, inactive employee: remaining balance in cancellation month (BR-05)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=RECENT, employee_id="E9999")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "deals_created", 1),
                              contains(R + "chunks[0].records[0].Notes", "BR-05: Cancelled within 12 months of go-live, EE Inactive"),
                              eq(R + "chunks[0].records[0].EE_Active", "Inactive")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
], f"Go-live {RECENT} (3 months before generation).")
add("D-14 New cancelled deal without go-live date is not amortized (BR-08)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date="")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "non_live_rows", 1), eq(R + "written_records", 1),
                              eq(R + "chunks[0].records[0].Remaining_Balance", "3600"),
                              contains(R + "chunks[0].records[0].Notes", "BR-08: Cancelled with no go-live date")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
])
add("D-15 New cancelled deal with go-live but no amount is skipped", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", total_commission_payable="",
                                                total_commission_paid="")])]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "written_records", 0),
                              contains(R + "invalid_text", "both blank or not a valid number")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1)]),
])
add("D-16 Unknown status row in a forced batch is skipped without details", [
    trigger(mode="force_submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="pending", is_live="false", has_issues="true")])]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "written_records", 0), eq(R + "invalid_text", "")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1)]),
])
add("D-17 Duplicate deal and employee in the batch: only the first row is used", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(), upload_row(row_number="3")])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "deals_created", 1), eq(R + "records_created", 1),
                              contains(R + "invalid_text", "Row 3 (Sunrise Motors | TK-0001 | SKU-ARC-1): the same deal and employee already appeared earlier in the file")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1), eq("deals_created", 1)]),
])
add("D-18 Same deal split across two employees creates two records but one deal key", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(), upload_row(row_number="3", employee_id="E1002", employee_first_name="Ben")])]),
    *submit_write_mocks(inserted=2),
    node(N["match"], asserts=[eq(R + "records_created", 2), eq(R + "deals_created", 1), eq(R + "live_deals", 2),
                              eq(R + "written_records", 72), eq(R + "rows_skipped_invalid", 0),
                              eq(R + "chunks[0].records[1].Employee_ID", "E1002")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("written_records", 2), eq("deals_created", 1)]),
], "deals_created counts distinct Tekion ID + SKU, records_created counts stored records (one per employee).")
add("D-19 Employee ids are normalized before the active check (.0 suffix, leading zeros, case)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(employee_id="1001"), upload_row(row_number="3", tekion_id="TK-0002", employee_id="e1002"),
                                     upload_row(row_number="4", tekion_id="TK-0003", employee_id="E7777")])],
                       hier=hierarchy("0001001.0", "E1002")),
    *submit_write_mocks(inserted=3),
    node(N["match"], asserts=[eq(R + "records_created", 3), eq(R + "chunks[0].records[0].EE_Active", "Active"),
                              eq(R + "chunks[0].records[1].EE_Active", "Active"), eq(R + "chunks[0].records[2].EE_Active", "Inactive")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("written_records", 3)]),
])

# =============================================================================
# E. Submit: existing deals, transitions, idempotency
# =============================================================================
LIVE_EXISTING = dict(Product_Status="live", Go_Live_Date="2026-09-01", Remaining_Balance="0")
add("E-01 Tekion ID '.0' suffix and dealer punctuation are normalized when matching a stored deal", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(tekion_id="12345.0", dealer_name="SUNRISE-MOTORS", product_status="signed", is_live="false")])],
                       existing=[existing_deal(Tekion_ID="12345", Dealer_Name="Sunrise Motors", Product_Status="signed")]),
    *submit_write_mocks(updated=1),
    node(N["check_batch"], asserts=[eq(R + "tekion_ids[0]", "12345.0"), eq(R + "tekion_ids[1]", "12345")]),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), eq(R + "deals_created", 0), eq(R + "records_updated", 1),
                              eq(R + "records_created", 0), eq(R + "matched_no_change", 0),
                              eq(R + "update_chunks[0].updates[0].id", "deal-1"),
                              eq(R + "update_chunks[0].updates[0].deal_key", "sunrisemotors|12345|sku-arc-1")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1), eq("deals_created", 0)]),
])
add("E-02 Signed to live adds months 2 to 36 to the stored deal (BR-01)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="signed")]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), eq(R + "rows_updated", 1), eq(R + "rows_added_to_existing", 35),
                              eq(R + "live_deals", 1), eq(R + "records_updated", 1), eq(R + "records_created", 0),
                              eq(R + "update_chunks[0].updates[0].Product_Status", "live"),
                              eq(R + "update_chunks[0].updates[0].Go_Live_Date", "2026-09-01"),
                              eq(R + "update_chunks[0].updates[0].schedule[0].month", "2026-10"),
                              eq(R + "update_chunks[0].updates[0].schedule[35].m", 36),
                              eq(R + "update_chunks[0].updates[0].Remaining_Balance", "0"),
                              contains(R + "update_chunks[0].updates[0].Notes", "BR-01 (status moved from signed to live)"),
                              eq(R + "audit_chunks[0].records[0].entry.status[0]", "signed"),
                              eq(R + "audit_chunks[0].records[0].entry.status[1]", "live")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1), eq("rows_added_to_existing", 35),
                                  eq("deals_created", 0), eq("live_deals_amortized", 1)]),
])
add("E-03 Live to signed is not allowed and writes nothing", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed", is_live="false")])],
                       existing=[existing_deal(schedule=schedule_36(3600, "2026-10"), **LIVE_EXISTING)]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "invalid_transitions", 1), eq(R + "deals_updated", 0), eq(R + "records_updated", 0),
                              eq(R + "records_created", 0), eq(R + "deal_versions_written", 0),
                              contains(R + "invalid_text", "status cannot be changed from live to signed, nothing written")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("invalid_transitions", 1), eq("deals_updated", 0),
                                  contains("invalid_transition_details", "from live to signed")]),
])
add("E-04 Scheduled to signed_lost is allowed, signed to cancelled is not", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="signed_lost", is_live="false"),
                                     upload_row(row_number="3", tekion_id="TK-0002", product_status="cancelled", is_live="false")])],
                       existing=[existing_deal(id="deal-1", Product_Status="scheduled"),
                                 existing_deal(id="deal-2", Tekion_ID="TK-0002", Product_Status="signed")]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), eq(R + "invalid_transitions", 1), eq(R + "records_updated", 1),
                              eq(R + "update_chunks[0].updates[0].Product_Status", "signed_lost"),
                              contains(R + "update_chunks[0].updates[0].Notes", "BR-03 (status moved from scheduled to signed_lost)"),
                              contains(R + "invalid_text", "TK-0002 | SKU-ARC-1: status cannot be changed from signed to cancelled")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1), eq("invalid_transitions", 1)]),
])
add("E-05 Stored deal with an unrecognised status blocks the row", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="weird")]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "invalid_transitions", 1), eq(R + "deals_updated", 0),
                              contains(R + "invalid_text", "stored status weird is not recognised")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("invalid_transitions", 1)]),
])
add("E-06 Re-uploading a live deal with the same total changes nothing", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])],
                       existing=[existing_deal(schedule=schedule_36(3600, "2026-10"), **LIVE_EXISTING)]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "matched_no_change", 1), eq(R + "deals_updated", 0), eq(R + "rows_updated", 0),
                              eq(R + "live_deals", 0), eq(R + "records_updated", 0), eq(R + "records_created", 0),
                              eq(R + "invalid_transitions", 0), eq(R + "deal_versions_written", 0)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("matched_no_change", 1), eq("deals_updated", 0),
                                  eq("deal_versions_written", 0)]),
], "Idempotency: the same file submitted twice must not rewrite or re-version the deal.")
add("E-07 Live deal re-uploaded with a higher total books a catch-up and keeps booked months (BR-09)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(total_commission_payable="7200", total_commission_paid="7200",
                                                total_commission_calculated="7200")])],
                       existing=[existing_deal(schedule=schedule_36(3600, "2026-10"), **LIVE_EXISTING)]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), eq(R + "rows_updated", 36), eq(R + "live_deals", 1),
                              eq(R + "records_updated", 1), eq(R + "rows_added_to_existing", 0),
                              eq(R + "update_chunks[0].updates[0].Total_Commission_Paid", "7200"),
                              eq(R + "update_chunks[0].updates[0].schedule[35].m", 36),
                              eq(R + "update_chunks[0].updates[0].schedule[35].bal", 0),
                              eq(R + "update_chunks[0].updates[0].schedule[0].n", 100),
                              eq(R + "update_chunks[0].updates[0].schedule[0].cum", 100),
                              eq(R + "update_chunks[0].updates[0].schedule[2].n", 200),
                              eq(R + "update_chunks[0].updates[0].schedule[35].cum", 7200),
                              contains(R + "audit_chunks[0].records[0].entry.rule", "BR-09"),
                              eq(R + "deal_versions_written", 1)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1), eq("rows_updated", 36)]),
], "Observation: the stored deal's Notes keep the month-1 note (the fold takes the first month's update), so BR-09 only shows in the audit rule. "
   "schedule[0] = Oct 2026 stays booked at 100; catch-up lands in the first open month.")
OLD_LIVE = dict(Product_Status="live", Go_Live_Date=OLD, Remaining_Balance="0")
add("E-08 Live to cancelled after 12 months: rest amortized in the cancellation month, later rows deleted (BR-06)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=OLD)])],
                       existing=[existing_deal(schedule=schedule_36(3600, month_after(OLD)), **OLD_LIVE)]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), gt(R + "rows_deleted", 0), gt(R + "rows_updated", 12),
                              eq(R + "invalid_transitions", 0), eq(R + "records_updated", 1), eq(R + "records_created", 0),
                              eq(R + "update_chunks[0].updates[0].Product_Status", "cancelled"),
                              eq(R + "update_chunks[0].updates[0].Remaining_Balance", "0"),
                              contains(R + "update_chunks[0].updates[0].Notes", "BR-06 (status moved from live to cancelled)"),
                              contains(R + "update_chunks[0].updates[0].Notes", "later monthly rows were deleted"),
                              gt(R + "audit_chunks[0].records[0].entry.rows_deleted", 0)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1), gt("rows_deleted", 0)]),
], f"Go-live {OLD}; schedule from {month_after(OLD)}. Valid while the schedule still has months after the run month.")
RECENT_LIVE = dict(Product_Status="live", Go_Live_Date=RECENT, Remaining_Balance="0")
add("E-09 Live to cancelled within 12 months, active employee: reversal (BR-07)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=RECENT)])],
                       existing=[existing_deal(schedule=schedule_36(3600, month_after(RECENT)), **RECENT_LIVE)]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), gt(R + "rows_deleted", 20), eq(R + "invalid_transitions", 0),
                              contains(R + "update_chunks[0].updates[0].Notes", "BR-07 (status moved from live to cancelled)"),
                              contains(R + "update_chunks[0].updates[0].Notes", "reversed in the cancellation month")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1)]),
], f"Go-live {RECENT}. Valid while that is within 12 months of the run.")
add("E-10 Live to cancelled within 12 months, inactive employee: rest in cancellation month (BR-05)", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date=RECENT, employee_id="E9999")])],
                       existing=[existing_deal(schedule=schedule_36(3600, month_after(RECENT)), Employee_ID="E9999", EE_Look_up="E9999",
                                               EE_Active="Inactive", **RECENT_LIVE)]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), gt(R + "rows_deleted", 20),
                              contains(R + "update_chunks[0].updates[0].Notes", "BR-05 (status moved from live to cancelled)"),
                              contains(R + "update_chunks[0].updates[0].Notes", "EE Inactive")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1)]),
], f"Go-live {RECENT}. Valid while that is within 12 months of the run.")
add("E-11 Live to cancelled without any go-live date is skipped", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="cancelled", is_live="false", go_live_date="")])],
                       existing=[existing_deal(Product_Status="live", Go_Live_Date="")]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_invalid", 1), eq(R + "deals_updated", 0),
                              contains(R + "invalid_text", "live to cancelled but no go-live date is available")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_invalid", 1)]),
])
add("E-12 Blank status on a stored live deal refreshes amounts and keeps the status", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(product_status="", is_live="false", total_commission_due="250")])],
                       existing=[existing_deal(schedule=schedule_36(3600, "2026-10"), **LIVE_EXISTING)]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "blank_status_rows", 1), eq(R + "deals_updated", 1), eq(R + "rows_updated", 1),
                              eq(R + "records_updated", 1), eq(R + "invalid_transitions", 0),
                              eq(R + "update_chunks[0].updates[0].Product_Status", "live"),
                              eq(R + "update_chunks[0].updates[0].Total_Commission_Due", "250"),
                              eq(R + "update_chunks[0].updates[0].schedule[35].m", 36)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("blank_status_rows", 1), eq("deals_updated", 1)]),
])
add("E-13 Stored deal matched on Tekion ID + SKU but a different employee still updates the deal", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row(employee_id="E1002", employee_first_name="Ben")])],
                       existing=[existing_deal(Product_Status="signed", Employee_ID="E1001")]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deals_updated", 1), eq(R + "deals_created", 0),
                              eq(R + "update_chunks[0].updates[0].Employee_ID", "E1002"),
                              eq(R + "update_chunks[0].updates[0].EE_Look_up", "E1002")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1)]),
], "Documents current behaviour: the match falls back to any stored row of the deal when the employee differs.")

# =============================================================================
# F. Submit: scopes and audit trail
# =============================================================================
add("F-01 2025_prior scope does not create unmatched deals", [
    trigger(mode="submit_2025_prior", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])]),
    *submit_write_mocks(),
    node(N["match"], asserts=[eq(R + "rows_skipped_no_match", 1), eq(R + "deals_created", 0), eq(R + "written_records", 0),
                              eq(R + "deal_scope", "2025_prior"),
                              contains(R + "no_match_text", "no existing deal found for a 2025 and prior deal, a new line is not allowed")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("rows_skipped_no_match", 1), eq("deal_scope", "2025_prior"),
                                  eq("deals_created", 0), contains("no_match_details", "nothing written")]),
])
add("F-02 2025_prior scope still updates a matched deal", [
    trigger(mode="submit_2025_prior", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="signed")]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "rows_skipped_no_match", 0), eq(R + "deals_updated", 1), eq(R + "deal_scope", "2025_prior"),
                              eq(R + "audit_chunks[0].records[0].entry.rows_added", 35)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deals_updated", 1)]),
])
add("F-03 2026_future scope is carried into the result", [
    trigger(mode="submit_2026_future", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "deal_scope", "2026_future"), eq(R + "final_status", "submitted"), eq(R + "deals_created", 1)]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deal_scope", "2026_future"), eq("mode", "submit_2026_future")]),
])
add("F-04 force_submit_lawrence sets scope lawrence and final status force_submitted", [
    trigger(mode="force_submit_lawrence", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])]),
    *submit_write_mocks(inserted=1),
    node(N["match"], asserts=[eq(R + "deal_scope", "lawrence"), eq(R + "final_status", "force_submitted")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deal_scope", "lawrence")]),
])
add("F-05 Audit trail entry continues from the stored entry_count and head_hash", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="signed")],
                       versions=[{"id": "v-1", "properties": {"deal_key": "sunrisemotors|tk-0001|sku-arc-1", "entry_count": 3,
                                                                "head_hash": "abc123", "current_cycle": 2}}]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "deal_versions_written", 1),
                              eq(R + "audit_chunks[0].records[0].id", "sunrisemotors|tk-0001|sku-arc-1"),
                              eq(R + "audit_chunks[0].records[0].version", "v4"), eq(R + "audit_chunks[0].records[0].cycle", "2"),
                              eq(R + "audit_chunks[0].records[0].batch", "B-TEST"), eq(R + "audit_chunks[0].records[0].status", "live"),
                              eq(R + "audit_chunks[0].records[0].entry.seq", 4), eq(R + "audit_chunks[0].records[0].entry.prev_hash", "abc123"),
                              eq(R + "audit_chunks[0].records[0].entry.rule", "BR-01"), exists(R + "audit_chunks[0].records[0].entry.hash"),
                              exists(R + "audit_chunks[0].records[0].entry.snap"), missing(R + "audit_chunks[0].records[0].entry.base")]),
    node(N["submitted"], asserts=[eq("submitted", "true"), eq("deal_versions_written", 1)]),
])
add("F-06 First audit entry of a deal carries the base snapshot", [
    trigger(mode="submit", batch_id="B-TEST"),
    *submit_read_mocks([batch_chunk([upload_row()])], existing=[existing_deal(Product_Status="signed")]),
    *submit_write_mocks(updated=1),
    node(N["match"], asserts=[eq(R + "audit_chunks[0].records[0].version", "v1"), eq(R + "audit_chunks[0].records[0].entry.prev_hash", ""),
                              exists(R + "audit_chunks[0].records[0].entry.base"), eq(R + "audit_chunks[0].records[0].entry.base.rid", "deal-1"),
                              eq(R + "audit_chunks[0].records[0].entry.snap.rid", "deal-1")]),
    node(N["submitted"], asserts=[eq("submitted", "true")]),
])

# =============================================================================
# V. Validate: file rules
# =============================================================================
def validate_mocks(stored=None, mock_errors_excel=True):
    out = [
        node(N["fetch_stored"], mock=fetch(stored or [], cursor=True), verify=None),
        node(N["save_logs"], mock={"inserted": 1}, verify=None),
        node(N["upload_rec_ok"], mock={"id": "mock"}, verify=None),
        node(N["upload_rec_err"], mock={"id": "mock"}, verify=None),
    ]
    if mock_errors_excel:
        out.append(node(N["errors_excel"], mock={"fileDetails": {"name": "validation_errors_mock.xlsx", "source": "mock/validation_errors_mock.xlsx",
                                                                 "sourceType": "CLOUD_STORAGE", "fileType": "xlsx",
                                                                 "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}}, verify=None))
    return out


def stored_deal(status="signed", id="s-1", **kw):
    p = dict(Tekion_ID="TK-0001", Dealer_Name="Sunrise Motors", SKU_ID="SKU-ARC-1", Product_Status=status, Employee_ID="E1001")
    p.update(kw)
    return {"id": id, "properties": p}


S = "result."


def v_ok_nodes(total, live):
    return [
        node(N["summary"], asserts=[eq(S + "total_count", total), eq(S + "live_count", live), eq(S + "skipped_count", total - live),
                                    eq(S + "flagged_count", 0), eq(S + "isIssues", "false")]),
        node(N["respond_ok"], asserts=[eq("isIssues", "false"), eq("message", "All good. No errors found in the file."),
                                       eq("mode", "validate"), eq("submitted", "false"), exists("batch_id"), contains("html_report", "All good")]),
    ]


def v_flag_nodes(total, live, flagged, rule, msg_part=None, extra=(), error_rule=None):
    a = [eq(S + "total_count", total), eq(S + "live_count", live), eq(S + "flagged_count", flagged), eq(S + "isIssues", "true"),
         eq(S + "flagged_rows[0].flags[0].rule", rule), eq(S + "rule_counts[0].rule", rule), eq(S + "error_rows[0].Rule", error_rule or rule)]
    if msg_part:
        a.append(contains(S + "flagged_rows[0].flags[0].message", msg_part))
    a.extend(extra)
    return [
        node(N["summary"], asserts=a),
        node(N["respond_errors"], asserts=[eq("isIssues", "true"), eq("message", "Errors found. Download the attached Excel for the full list."),
                                           eq("submitted", "false"), exists("errors_file"), exists("batch_id"), contains("html_report", rule)]),
    ]


add("V-01 Clean live row passes and staging rows are saved", [
    trigger(mode="validate", excel=xl("clean_one_live")),
    *validate_mocks(),
    node(N["cross_checks"], asserts=[exists(S + "flags")]),
    node(N["validate_batch"], asserts=[eq(S + "row_count", 1), eq(S + "live_count", 1), eq(S + "flagged_count", 0), eq(S + "logged_count", 1),
                                       eq(S + "chunks[0].records[0].status", "validated"), eq(S + "chunks[0].records[0].has_issues", "false"),
                                       eq(S + "chunks[0].records[0].rows[0].row_number", "2"), eq(S + "chunks[0].records[0].rows[0].is_live", "true"),
                                       eq(S + "chunks[0].records[0].rows[0].tekion_id", "TK-0001"), exists(S + "chunks[0].records[0].batch_id")]),
    node(N["save_logs"], mock={"inserted": 1}),
    node(N["upload_rec_ok"], mock={"id": "mock"}),
    *v_ok_nodes(1, 1),
])
add("V-02 Empty file (header only) reports a file error", [
    trigger(mode="validate", excel=xl("empty_header_only")),
    *validate_mocks(),
    node(N["summary"], asserts=[eq(S + "total_count", 0), eq(S + "live_count", 0), eq(S + "flagged_count", 0), eq(S + "isIssues", "true"),
                                eq(S + "file_errors[0]", "No data rows were found in the file."), eq(S + "error_rows_preview[0].Rule", "File error")]),
    node(N["respond_errors"], asserts=[eq("isIssues", "true"), eq("error_rows[0].Rule", "File error"),
                                       contains("html_report", "No data rows were found")]),
])
add("V-03 Unknown product status is flagged", [
    trigger(mode="validate", excel=xl("unknown_status")),
    *validate_mocks(),
    *v_flag_nodes(1, 0, 1, "Unknown product status", "Product Status pending is not recognised"),
])
add("V-04 Live row with missing required fields lists every missing column", [
    trigger(mode="validate", excel=xl("live_missing_required")),
    *validate_mocks(),
    *v_flag_nodes(1, 1, 1, "Missing required information", "Employee First Name, Currency, Payout Date"),
])
add("V-05 Live row with blank amounts is flagged as missing information", [
    trigger(mode="validate", excel=xl("live_blank_amounts")),
    *validate_mocks(),
    *v_flag_nodes(1, 1, 1, "Missing required information", "Total Commission Payable or Total Commission Paid"),
])
add("V-06 Live row with an invalid amount and an invalid date gets both flags", [
    trigger(mode="validate", excel=xl("live_bad_amount_and_date")),
    *validate_mocks(),
    *v_flag_nodes(1, 1, 1, "Invalid amount", "abc", extra=[eq(S + "flagged_rows[0].flags[1].rule", "Invalid date"),
                                                           contains(S + "flagged_rows[0].flags[1].message", "notadate"),
                                                           eq(S + "rule_counts[1].rule", "Invalid date")],
                  error_rule="Invalid amount | Invalid date"),
])
add("V-07 Zero commission within 12 months of go-live is flagged", [
    trigger(mode="validate", excel=xl("zero_commission_early")),
    *validate_mocks(),
    *v_flag_nodes(1, 1, 1, "Zero commission before 12 months", "only 2 month(s) before the payout date"),
])
add("V-08 Zero commission after 12 months of go-live is accepted", [
    trigger(mode="validate", excel=xl("zero_commission_late")),
    *validate_mocks(),
    *v_ok_nodes(1, 1),
])
add("V-09 Duplicate deal and employee flags every copy", [
    trigger(mode="validate", excel=xl("duplicate_deal")),
    *validate_mocks(),
    node(N["cross_checks"], asserts=[eq(S + "flags[0].rule", "Duplicate deal in file"), eq(S + "flags[0].n", 2), eq(S + "flags[1].n", 3)]),
    *v_flag_nodes(2, 2, 2, "Duplicate deal in file", "Excel rows 2, 3 have the same Dealer Name, Tekion ID, SKU ID and Employee ID",
                  extra=[eq(S + "rule_counts[0].count", 2)]),
])
add("V-10 Duplicate detection ignores dealer name case and punctuation", [
    trigger(mode="validate", excel=xl("duplicate_deal_normalised")),
    *validate_mocks(),
    *v_flag_nodes(2, 2, 2, "Duplicate deal in file"),
])
add("V-11 More than two employees on one live Tekion ID is flagged on every row", [
    trigger(mode="validate", excel=xl("too_many_employees")),
    *validate_mocks(),
    *v_flag_nodes(3, 3, 3, "Too many employees", "has 3 different employees"),
])
add("V-12 Two employees on one Tekion ID is accepted", [
    trigger(mode="validate", excel=xl("two_employees_ok")),
    *validate_mocks(),
    *v_ok_nodes(2, 2),
])
add("V-13 Cancelled deal with go-live but no amounts is flagged", [
    trigger(mode="validate", excel=xl("cancelled_no_amounts")),
    *validate_mocks(),
    *v_flag_nodes(1, 0, 1, "Missing required information", "required for a cancelled deal that has a Go Live Date"),
])
add("V-14 Cancelled deal with an unparseable amount is flagged", [
    trigger(mode="validate", excel=xl("cancelled_bad_amount")),
    *validate_mocks(),
    *v_flag_nodes(1, 0, 1, "Invalid amount", "n/a"),
])
add("V-15 Cancelled deal without go-live needs no amounts", [
    trigger(mode="validate", excel=xl("cancelled_no_golive")),
    *validate_mocks(),
    *v_ok_nodes(1, 0),
])
add("V-16 Status synonyms (Canceled, Singed Lost, SIGNED, blank) are recognised", [
    trigger(mode="validate", excel=xl("status_synonyms")),
    *validate_mocks(),
    *v_ok_nodes(7, 0),
])
add("V-17 Non-live rows are not checked for required fields", [
    trigger(mode="validate", excel=xl("non_live_missing_fields")),
    *validate_mocks(),
    *v_ok_nodes(1, 0),
])
add("V-18 Currency symbols, thousands separators, parentheses and date formats are accepted", [
    trigger(mode="validate", excel=xl("live_number_formats")),
    *validate_mocks(),
    *v_ok_nodes(1, 1),
])
add("V-19 Blank rows in the middle of the file are ignored and row numbers stay aligned", [
    trigger(mode="validate", excel=xl("blank_rows_in_middle")),
    *validate_mocks(),
    node(N["validate_batch"], asserts=[eq(S + "total_count", 2), eq(S + "chunks[0].records[0].rows[0].row_number", "2"),
                                       eq(S + "chunks[0].records[0].rows[1].row_number", "4")]),
    *v_ok_nodes(2, 2),
])
add("V-20 validate_2026_future takes the normal validate path", [
    trigger(mode="validate_2026_future", excel=xl("clean_one_live")),
    *validate_mocks(),
    *v_ok_nodes(1, 1),
])

# =============================================================================
# W. Validate against stored deals, scopes, errors Excel
# =============================================================================
add("W-01 Signed to live against a stored deal is allowed", [
    trigger(mode="validate", excel=xl("transition_signed_to_live")),
    *validate_mocks(stored=[stored_deal("signed")]),
    *v_ok_nodes(1, 1),
])
add("W-02 Live to signed against a stored deal is flagged", [
    trigger(mode="validate", excel=xl("transition_live_to_signed")),
    *validate_mocks(stored=[stored_deal("live")]),
    *v_flag_nodes(1, 0, 1, "Status change not allowed", "Status cannot be changed from live to signed"),
])
add("W-03 Live to cancelled against a stored deal is allowed", [
    trigger(mode="validate", excel=xl("transition_live_to_cancelled")),
    *validate_mocks(stored=[stored_deal("live")]),
    *v_ok_nodes(1, 0),
])
add("W-04 Stored deal match normalises Tekion ID and dealer name", [
    trigger(mode="validate", excel=xl("transition_live_to_signed")),
    *validate_mocks(stored=[stored_deal("live", Tekion_ID="TK-0001.0", Dealer_Name="sunrise motors!")]),
    *v_flag_nodes(1, 0, 1, "Status change not allowed"),
])
add("W-05 2025_prior scope flags rows with no stored deal", [
    trigger(mode="validate_2025_prior", excel=xl("clean_one_live")),
    *validate_mocks(),
    *v_flag_nodes(1, 1, 1, "No matching existing deal", "a new line is not allowed"),
])
add("W-06 2025_prior scope accepts rows that match a stored deal", [
    trigger(mode="validate_2025_prior", excel=xl("clean_one_live")),
    *validate_mocks(stored=[stored_deal("signed")]),
    *v_ok_nodes(1, 1),
])
add("W-07 Mixed file aggregates rule counts and writes the errors Excel", [
    trigger(mode="validate", excel=xl("mixed_many_errors")),
    *validate_mocks(mock_errors_excel=False),
    node(N["summary"], asserts=[eq(S + "total_count", 6), eq(S + "live_count", 5), eq(S + "flagged_count", 5), eq(S + "isIssues", "true"),
                                eq(S + "rule_counts[0].rule", "Unknown product status"), eq(S + "rule_counts[1].rule", "Missing required information"),
                                eq(S + "rule_counts[2].rule", "Invalid amount"), eq(S + "rule_counts[3].rule", "Duplicate deal in file"),
                                eq(S + "rule_counts[3].count", 2), eq(S + "flagged_rows[0].row_number", 3), eq(S + "flagged_rows[4].row_number", 7),
                                eq(S + "error_rows_preview[0].Rule", "Unknown product status")]),
    node(N["errors_excel"], asserts=[exists("fileDetails"), starts("fileDetails.name", "validation_errors")]),
    node(N["file_objs_err"], asserts=[exists(S + "errors_file"), exists(S + "excel_file"), eq(S + "excel_file.name", "mixed_many_errors.xlsx")]),
    node(N["upload_rec_err"], mock={"id": "mock"}),
    node(N["respond_errors"], asserts=[eq("isIssues", "true"), eq("submitted", "false"), eq("mode", "validate"),
                                       starts("errors_file.name", "validation_errors"), eq("error_rows[0].Rule", "Unknown product status"),
                                       contains("html_report", "Duplicate deal in file: 2"), contains("html_report_textbox", "Flagged rows")]),
], "The errors Excel writer runs for real in this test (one small file per run).")
