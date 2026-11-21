# File Validation automation: test cases and suites

Automation: **File Validation - preview** (`6a86c96bbcd82c7b30a8e63f`) on `finance.toc.tekioncloud.xyz`,
the callable that validates and submits commission amortization uploads
(`validate` / `submit` / `force_submit`, optionally `_2025_prior`, `_2026_future`, `_lawrence`).

The tests live in the platform under *Automations → File Validation - preview → Tests*.
This folder holds the generator that created them, so they can be re-created, extended or
regenerated when the automation changes.

## What is covered

| Suite | Prefix | Cases | Covers |
|---|---|---|---|
| FV-1 Input guards | `G-` | 8 | unknown / suffixed / case-sensitive mode, missing `batch_id`, missing file, missing mode (documented gap) |
| FV-2 Submit batch guards | `B-` | 7 | batch not found, already submitted, issues vs `force_submit`, empty org hierarchy, write-count mismatch, failed updates |
| FV-3 Submit new deals | `D-` | 19 | BR-01 schedule, BR-02/03/04/05/06/07/08 branches, amount and date parsing, blank status, duplicates, two employees per deal, employee-id normalisation |
| FV-4 Submit stored deals and transitions | `E-` | 13 | Tekion ID / dealer normalisation, signed→live, invalid transitions, unrecognised stored status, idempotent re-upload, BR-09 catch-up, live→cancelled (BR-05/06/07), blank status refresh, employee fallback |
| FV-5 Submit scopes and audit trail | `F-` | 6 | `_2025_prior` no-create rule, `_2026_future`, `force_submit_lawrence`, audit trail version/hash chaining, base snapshot |
| FV-6 Validate file rules | `V-` | 20 | real Excel fixtures: required fields, blank/invalid amounts, invalid dates, zero commission rule, duplicates, >2 employees, cancelled rules, synonyms, number/date formats, empty file, blank rows |
| FV-7 Validate against stored deals | `W-` | 7 | transition checks against stored deals, normalised matching, `_2025_prior` scope, mixed file with real errors-Excel |

Test plan **FV File Validation regression** runs all seven suites.

Every storage read and write node a test reaches is mocked (`MOCK` with a realistic output), so
the suite never writes to `commission_amotizations`, `commission_amotization_logs_`,
`commission_amoti_audit_trail` or `commission_amotization_file`. Groovy/JS/variable/loop nodes run
for real. The only unmocked write is the errors Excel in `W-07` (one small export file per run).
Validate-path tests use the Excel fixtures in `fixtures/`, uploaded once to cloud storage
(`files.json` holds the file objects).

Assertions follow the platform's model: `VERIFY_CALL` (step executed) on every asserted node plus
`DATA` assertions with `{{ node.outputs.path }}` expressions. A test fails if an asserted node is
not reached, so no test can pass vacuously.

## Files

- `ua_api.py` – minimal client for `/api/unit-test/*`, run status and node-execution queries.
- `ua_upload.py` – multipart upload to cloud storage (`create-multipart-upload` → `upload-part` → `complete-multipart-upload`).
- `tc_lib.py` – builders: node ids, mocks, assertions, upload rows, stored deals, 36-month schedules.
- `cases.py` – the test definitions (one `add(...)` per test).
- `make_xlsx.py` – generates `fixtures/*.xlsx`; `upload_fixtures.py` uploads them and writes `files.json`.
- `run_cases.py` – creates/updates the test cases from `cases.py` (idempotent by name via `registry.json`) and optionally runs them.
- `make_suites.py` – creates/updates the suites and the test plan from `registry.json`.

## Running

```bash
export UA_COOKIE=<value of the _at cookie for finance.toc.tekioncloud.xyz>
python3 run_cases.py cases --run              # create/update every case and run it
python3 run_cases.py cases --run --only E-07  # one case
python3 make_suites.py                        # refresh suite membership
```

In the UI: *Tests → Test Suites → ⋯ → Run*, or open a case and press **Test**. The *Runs* tab is
currently broken on this tenant (`Unknown table REPORTING_2.UNIT_TEST_EXECUTION`); use the
case's *Run* view or `lastRunStatus` instead.

## Time-dependent cases

The automation takes "now" from the run (`__RUN__.outputs.currentTime`, Asia/Kolkata) and it
cannot be mocked. Cases that depend on months-since-go-live use dates computed at generation time
(`months_ago(3)` / `months_ago(17)` in `cases.py`) and assert ranges and rule codes rather than
exact amounts:

- `D-12`, `D-13`, `E-09`, `E-10` need go-live within 12 months → valid for ~9 months after generation.
- `D-11`, `E-08` need go-live more than 12 months ago with schedule months still ahead → valid until mid-2028.
- `D-01`, `E-02` use a fixed go-live of 2026-09-01; the late-go-live suffix in the notes changes amounts, not the asserted structure.

Re-run `run_cases.py cases` to refresh the dates (it rewrites the stored cases in place).

## Behaviours documented by the tests (worth a product decision)

- `G-08`: a call with no `mode` at all is not rejected; it falls through to validate ("No file uploaded").
- `D-04`: a new deal with a blank Product Status is stored **without** a `Product_Status` key, so the next upload treats it as `signed`.
- `D-18`: `deals_created` counts distinct Tekion ID + SKU, while `records_created` counts one record per employee.
- `E-07`: after a BR-09 catch-up the stored deal's `Notes` keep the month-1 note; BR-09 is only visible in the audit rule and per-month lines.
- `E-13`: when the uploaded employee differs from every stored row of the deal, the match falls back to any stored row and overwrites `Employee_ID`.
- `V-01`/`V-20`/`W-07`: the validate responses hard-code `mode: "validate"` even for `validate_2026_future`.
- `D-16`: an unknown status row skipped during a forced submit is counted in `rows_skipped_invalid` but not listed in `invalid_transition_details`.
- A storage failure cannot be covered by a passing test: every node has `stepError: STOP`, so an `ERROR_MOCK` fails the run (and the test) rather than taking a handled path.
