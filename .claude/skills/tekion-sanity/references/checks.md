# Sanity checks: procedure and pass/fail

Each check is run by its own subagent, in parallel. `<base>` is the platform URL, `<ck>` the cookie file, `<out>` the scratchpad output dir, `<stamp>` is `YYYYMMDD-HHMM` at run start. Scripts live in `.claude/skills/tekion-sanity/scripts/`. Where a selector or API body is marked **discover**, it was not known when this file was written: find it on the first run (read `visibleText`, use `eval` steps, or inspect the page's network calls) and record it in `platform-api.md`.

Common rules:

- API calls use the API token via `scripts/ua_api_hdr.sh` (`x-ua-at` header). Browser steps use the browser session cookie via `scripts/ua_probe.mjs`. They are different credentials; see `platform-api.md` → AUTH MECHANISM.
- Time budgets are hard. Exceeding one is FAIL with note "timed out after N min".
- A login redirect or HTTP 401/403 at any step is AUTH_EXPIRED, not FAIL.
- Every created asset is named `sanity-<env>-<stamp>` (plus a suffix per check where noted) so it can be found and deleted. Record each one with `sanity_state.py ... created add <check> "<what>" --deleted yes|no` so the final post can list it.
- Evidence on FAIL: screenshot path, the error text, the session or run URL.
- Checks that drive an LLM agent (SB, WB, FDE-QA, FDE-CRUD) use **fixed prompts**. Do not vary them between runs unless the user overrides them; otherwise results are not comparable from one deploy to the next.
- Agent checks judge the **platform state**, never the agent's own claim. "Done" in a reply counts for nothing until the asset, record or canvas shows it.

## SB: Solution Builder (AI Teams)

Budget: 45 min for the build, 10 min for the functional script.

Why this prompt: the first run used a two-page expense tracker, which the team judged too simple to tell a healthy build from a lucky one. This one has three related objects, business rules, a role split, a dashboard with aggregates and validation, so the functional script can fail in specific, informative ways.

Fixed prompt:

> Build a vendor invoice approval portal for a finance team.
>
> Data: a Vendor object (name, contact email, category: Software / Services / Hardware / Travel, status: Active / Inactive). An Invoice object (invoice number, vendor lookup, amount, currency: USD / EUR / INR, invoice date, due date, description, status: Submitted / Approved / Rejected / Paid). An Approval object (invoice lookup, approver name, decision: Approved / Rejected, comment, decided at).
>
> Rules: an invoice with amount above 5000 needs two Approved records before its status becomes Approved; below that, one is enough. Any Rejected approval sets the invoice to Rejected. Due date must be on or after the invoice date; reject the form otherwise. Invoice number must be unique.
>
> Pages: (1) Vendors: a list with search by name and a form to add or edit a vendor. (2) Invoices: a list with filters on status and vendor, sortable by amount and due date, a create form with a vendor picker, and a detail view that shows the invoice's approval history. (3) Approvals: the pending invoices (status Submitted) with Approve and Reject buttons and a comment field; a decision writes an Approval record and updates the invoice status according to the rules. (4) Dashboard: total Approved amount, count of invoices per status, top 5 vendors by Approved amount, and a list of overdue invoices (due date in the past and status not Paid).
>
> Name the solution "sanity-<env>-<stamp>".

Procedure:

1. Open `<base>/p/0/ai-teams/<teamId>` with `ua_probe.mjs`. Confirm the team page loads (not login, no `apiErrors`). **Discover** the prompt input selector for starting a new build; submit the fixed prompt with `fill` + `press Enter` (or the send button).
2. Record the new session. Open `<base>/p/0/ai-teams/<teamId>/observability/sessions/all` and locate the session started in the last few minutes (`GetAllSessions` body pattern in `platform-api.md` once captured). Save its URL as evidence.
3. Poll the session every 2 min with `ua_probe.mjs` (`text` on the trace list). Collect any step whose status is error, any text matching `error|exception|failed|timed out`, and the final session state. If the builder asks a clarifying question, answer once with "Use sensible defaults and continue." and note it.
4. When the build completes, open the generated app (link from the session or the team's solutions list) and run the functional script with `ua_probe.mjs` actions. Each line is one assertion; record true/false for every one, do not stop at the first failure:
   1. Vendors page loads with a list and a create action visible.
   2. Create vendor `Sanity Vendor` (category Services, Active); it appears in the list and the search finds it.
   3. Create invoice `SAN-001` for `Sanity Vendor`, amount 1200 USD, due date after invoice date; it appears in the Invoices list with status Submitted.
   4. Validation: creating invoice `SAN-BAD` with due date before invoice date is rejected (error shown, no row created).
   5. Approvals page lists `SAN-001`; Approve it with comment `sanity ok`; the invoice status becomes Approved and its detail view shows one approval entry.
   6. Create invoice `SAN-002` for the same vendor, amount 8000; approve it once; its status is still Submitted (two approvals required above 5000).
   7. Invoices status filter set to Approved shows `SAN-001` only.
   8. Dashboard shows total Approved amount 1200 and `Sanity Vendor` in the top vendors.
5. Delete the solution (UI or API, **discover**). If deletion is not possible, say so in the note and record it with `created add ... --deleted no`.

PASS: build completed within budget, no error steps in the session trace, all eight assertions true.
FAIL: build did not complete, or any error step in the trace, or any assertion false. The note names the failed assertions by number and what was seen instead. The session URL is the primary evidence; an error step inside it is also a lead for ALERTS (same agent, knowledge or application may be failing elsewhere).

## WB: Workflow Builder agent (copilot inside the automation builder)

Budget: 8 min for part A (understand), 15 min for part B (build), 2 min cleanup. Both parts run in one agent, A then B.

Surface: the Workflow Builder is a copilot panel inside the automation (workflow) editor, URL `<base>/p/0/automations/<automationId>/builder?nav=copilot` (seen 2026-10-27; a `<prefix>-chatId=new` query param is added by the UI, prefix varies, do not hardcode it). Its agent entity on Pre-prod finance is `e_6aa19955aeb9ea1371af57c7`; sessions are at `<base>/p/0/ai-agents/<wbAgentId>/observability/sessions/all`. Known failure mode from Oct 2026 (TEK-657): the agent "gets stuck in thoughts", the final answer never renders, and the executor automation `67850d225384a9541846f5b9` logs `Your response does not match the required format`. Name it explicitly in the note when seen.

Part A, understand an existing automation. Target: the automation id from the inputs (default on Pre-prod finance: `Node Failure Alert - Finance`, `6ab21aea970f873408436c68`, a production poller that must not be modified).

1. `ua_probe.mjs --url <base>/p/0/automations/<explainId>/builder?nav=copilot`. Must load without login redirect, `apiErrors` empty. Screenshot.
2. Capture the node names on the canvas before asking anything (**discover** the node title selector; fallback: `visibleText` of the canvas container) and count them.
3. **Discover** the copilot input (first try `div[contenteditable='true'][role='textbox']`, the same as the FDE test page). Send the fixed prompt:
   > Explain this automation step by step: what triggers it, what each node does in order, and what it produces at the end. Do not change anything in the workflow.
4. Wait for the reply to finish (**discover** the end marker; fallback: poll `body` text every 15 s until it is unchanged for 30 s and the input is enabled again, 8 min cap). Screenshot. Slice the reply after the echoed prompt.
5. Re-capture the canvas node names and count.

Accept part A when all hold: a reply arrived within budget and is at least 80 words; it contains no error text (`something went wrong`, `error`, `failed to`, `try again`, stack trace); it names the trigger type and at least two node names captured in step 2 (case-insensitive substring match); the node count after equals the count before. A thinking indicator with no text for more than 4 min is a FAIL with note "stuck in thoughts (TEK-657 signature)".

Part B, build a new automation. Dependency-free by design: schedule trigger, code nodes and a branch, no connections, so a failure is the builder's, not a connector's.

1. Create an empty automation named `sanity-<env>-<stamp>-wb` (**discover**: the create action on `<base>/p/0/automations`, or a `POST /api/workflow-definition` body; record whichever works). Record it with `created add WB`.
2. Open its builder with `?nav=copilot` and send the fixed prompt:
   > Build this workflow. Trigger: a schedule that runs every weekday at 09:00 Asia/Kolkata. Step 1: a JavaScript code node that returns the current ISO timestamp and the day of the week. Step 2: a condition on the day of the week. If it is Saturday or Sunday, run a code node that returns {"skip": true}. Otherwise run a code node that returns {"ok": true, "checkedAt": <the timestamp from step 1>}. Do not deploy or publish the workflow.
3. If the builder asks a clarifying question or offers suggested options, pick the first sensible option once and note it. Wait for the reply to finish as in part A (15 min cap). Screenshot.
4. Read the canvas: node names and count (same selector as part A). If the builder exposes a test action for the draft (**discover**: a `Test` / `Run test` button), run it once and capture the result; a test run that errors is a FAIL. If there is no test action, judge on the canvas and say so in the note.
5. Open the WB agent's sessions list and record this session's URL as evidence; read its trace for error steps.
6. Delete the automation (**discover**: list-page menu or `POST /api/workflow-definition/<id>/delete`). Verify it is gone from the list. Update the `created` record. **Never deploy or leave deployed** a sanity automation: a scheduled automation left running would fire every weekday.

Accept part B when all hold: the final reply says the workflow was built, with no error text; the canvas has at least four nodes including a schedule trigger and a condition or branch node; the test run, if available, completed without error; the agent session trace has no error steps.

PASS: part A and part B both accepted. FAIL: either fails; the note says which part and which criterion. Evidence: the WB session URL, the canvas screenshot, the copilot screenshot. Failures of the agent executor automation `67850d225384a9541846f5b9` or runs mentioning `sanity-<env>-<stamp>-wb` during the window belong to this check (ALERTS correlates them).

## FDE-UI: AI FDE copilot panel (the surface users actually see)

Budget: 5 min.

The AI FDE that users talk to is the **copilot panel** opened from the `✦ AI FDE` button in the platform's top bar. Its greeting is "Hey, I'm AI FDE" / "I can help you do your best work" and it shows starter chips (seen 2026-11-25: "How do I convert or merge files (PDF, Excel)?", "How do I write an analytics SQL query?", "How do I map a data pill?"). These starters are configured on the **copilot**, not on the agent entity: `GET /api/entity/ai_agent/e_ai_fde_agent` has `conversationStarters: []` and the agent's `/test` page shows no chips. Do not judge starters from the agent config page or the `/test` page; that was the false FAIL of 2026-11-25.

1. `ua_probe.mjs --url <base>/p/0/ai-agents/<agentId>/configuration/instructions`: must load without login redirect, `apiErrors` empty, `visibleText` contains the instructions (non-empty). This is the "agent exists and is configured" half.
2. Open any platform page that shows the top bar (the same instructions URL is fine) and click the top-right `AI FDE` button: action `{"type":"click","selector":"text=AI FDE"}` (**discover** and record the stable selector if `text=` matches more than one element; a `role=button[name=/AI FDE/]` form is the next thing to try). Then `waitForText` `Hey, I'm AI FDE` with a 30 s timeout, `screenshot`, and capture the chips:
   `{"type":"eval","js":"[...document.querySelectorAll('button, [role=button], a')].map(e=>e.innerText.trim()).filter(t=>/^How do I|\?$/.test(t))"}`
3. Starters present = the eval returns at least one string, or `visibleText` contains at least one of the chip texts above.

PASS: instructions page loads cleanly, the panel opens with its greeting, at least one starter chip visible.
FAIL: panel does not open, greeting missing, or zero chips. Screenshot plus `apiErrors` are the evidence. If the panel opens but the chips are gone, say so explicitly: that is a copilot configuration regression, not a page failure, and still a FAIL.

## FDE-QA: two platform how-to questions to the AI FDE

Budget: 4 min per question. Read-only questions; the write path is `FDE-CRUD`.

Default questions:

1. `How can I configure an API connection to an external REST service in this platform?`
2. `How do I schedule an automation to run every day at 9 AM?`

Ask through the **copilot panel** (open it as in FDE-UI; input placeholder "Ask anything..."). If the panel cannot be driven, fall back to the agent test page `<base>/p/0/ai-agents/<agentId>/test?chatId=new` (input `div[contenteditable='true'][role='textbox']`, send with Enter) and say in the note which surface was used.

Reply capture (verified 2026-11-25 on the test page): there is no stable per-message selector. The agent first shows a tool line ("Let's make use of the tool Ask From Knowledge", 18 to 24 s), then "Generating response…", then the answer ending with "Response has been generated". Wait for that end marker (`waitForText`, 240 s), allow 5 s to settle, then `text` on `body` and slice after the echoed question. Do not `waitForText` on an answer term; it fires while the tool call is still running.

Acceptance per question (all three):

- a reply arrived within budget and is at least 40 words;
- it contains no error text (`something went wrong`, `error`, `failed to`, `try again later`, stack trace);
- it mentions at least two of the expected terms: Q1 `connector|connection|REST|API|authentication|endpoint`; Q2 `schedule|trigger|cron|daily|automation|time zone`.

PASS: both questions accepted. FAIL: either not. Quote the reply (first 15 lines) in the evidence.

## FDE-CRUD: the AI FDE performs create, read, update, delete on request

Budget: 4 min per step, five steps (tool discovery plus C, R, U, D), 22 min total.

Why: FDE-QA only proves the agent can look things up. Users ask it to do things. This check asks it to create, read, update and delete one asset and verifies **every step through the entity API**, never through the reply. Target asset: an evaluation `dataset`, because its API is verified (`platform-api.md`), so a failure here is the agent's and not the verifier's. The user can override the target in the inputs (for example an object's records); then the verification calls must be discovered first and recorded.

Scope rule: this is the only check allowed to ask the FDE to change anything, and only on the asset named `sanity-fde-<env>-<stamp>`. Never ask it to touch anything else.

0. Tool discovery: `GET /api/entity/ai_agent/<agentId>`; find the configured tools (**discover** the property path: try `properties.tools`, `properties.actions`, `properties.agentTools`, `properties.toolIds`) and record their names in `platform-api.md`. This is recorded regardless of the verdict so the team knows what the FDE can do on this tenant.
1. **Create**. Ask in the copilot panel (same surface and capture rules as FDE-QA):
   > Create an evaluation dataset named "sanity-fde-<env>-<stamp>" of type LLM with the description "created by sanity".
   Verify: `POST /api/entity/dataset` with `{"filter":{"field":"properties.name","op":"EQUAL","values":["sanity-fde-<env>-<stamp>"]},"page":{"limit":5,"offset":0}}` returns exactly one object; keep its id.
2. **Read**. Ask:
   > What is the description of the evaluation dataset named "sanity-fde-<env>-<stamp>"?
   Verify: the reply contains `created by sanity`.
3. **Update**. Ask:
   > Change the description of the evaluation dataset "sanity-fde-<env>-<stamp>" to "updated by sanity".
   Verify: `GET /api/entity/dataset/<id>` shows `properties.description` = `updated by sanity`.
4. **Delete**. Ask:
   > Delete the evaluation dataset "sanity-fde-<env>-<stamp>".
   Verify: `GET /api/entity/dataset/<id>` returns 404 or a "not found" 500 (see `platform-api.md`).

Per step: if the agent asks for confirmation ("Do you want me to proceed?"), answer `Yes, proceed.` once; a second confirmation request counts as no action. A reply saying it cannot or is not allowed to do it is recorded verbatim. Each step has its own 4 min budget; move on to the next step even when one fails, except that Read, Update and Delete are reported as "not attempted" when Create did not produce the dataset (nothing to act on). After step 4, if the dataset still exists, delete it through the API and record `created add FDE-CRUD ... --deleted yes` with the note that the API did the cleanup.

PASS: all four steps verified through the API within budget.
FAIL: any step not verified. The note says which steps passed (`C ✓ R ✓ U ✗ D –`) and quotes the agent's reply for the failed step. If the agent declined every write step, the note says "AI FDE has no create/update/delete capability on this tenant; tools: <names from step 0>" so the team can decide whether that is a regression or by design. If it is by design, the user adds `FDE-CRUD` to "Checks to skip" for that tenant.

## EVAL: Evaluation create and run

Budget: 15 min. Uses the verified entity API in `platform-api.md`.

1. Create dataset `sanity-<env>-<stamp>` (`POST /api/entity` with `entityType:"dataset"`, `type:"LLM"`, `visibleFields` as documented).
2. Create two test cases (`llm_test_case`, `properties.datasetId` set) with the two FDE-QA questions as `input` and an expected output of the form "Explains how to … Must mention: <two terms>".
3. Create an experiment (`entityType:"experiment"`, body in `platform-api.md`) against the FDE agent, with this dataset and an existing metric (Answer Relevancy `e_6ae06cf9d4501754c758f443` on Pre-prod finance if present, else any SCALE metric). Starting the run has no REST path: open `<base>/p/0/evaluation/experiments/<expId>/runs` with `ua_probe.mjs` and click `text=Start Run`.
4. Poll `POST /api/entity/experiment_runs` (filter on `properties.experimentId`) until `status` is `completed`, then `POST /api/entity/test_case_runs` (same filter, required) until every case has `actualOutput` and `metricScores`, within budget.
5. Delete the experiment, test cases and dataset (`POST /api/entity/<type>/delete/<id>`), and verify each `GET` now returns 404 or an empty result.

PASS: dataset and cases created, experiment ran to completion, both cases have an actual output and a metric score (the score value itself is not judged), cleanup verified.
FAIL: any create or run error, run not completing in budget, or missing scores. The run URL and the API error body are the evidence. Cleanup failure alone is a PASS with a "not deleted: …" note.

## ALERTS: automation alert channel watch (main session, loops)

The alert channel is fed by an automation that posts failed runs every 5 minutes. Only failures posted **after** `alert_since` (the moment the user provided inputs) exist for this run. Never read, report or count older alerts, and never search the channel history for them as a report; the team does not want to see previously failed runs.

Window: from `alert_since` until all of: `window_min` elapsed, all product checks terminal, and at least 10 minutes since the last product check finished (one full alert-poster cycle plus margin, so runs triggered by SB, WB, FDE-QA, FDE-CRUD and EVAL have had time to be reported).

Tick every 5 minutes. Each tick:

1. `slack_read_channel` on the alert channel with `oldest` = max(`alert_since`, ts of the last recorded alert). Ignore messages already in `state.json → alerts`. If the channel shows nothing new, that is a normal tick, not a problem; the poster may simply not have run yet.
2. For each new failed-run alert: read its thread. Open the run or session link with `ua_probe.mjs`; capture `visibleText` of the failing step. Extract:
   - automation / agent name and the failing node;
   - the exact error message;
   - the parent: which agent, knowledge base, application, connector or data source the failing node depends on (read the node's configuration or the trace input/output);
   - whether it was triggered by one of this run's product checks: match by asset name `sanity-<env>-<stamp>` (any suffix), by agent id (SB team, WB agent `e_6aa19955aeb9ea1371af57c7` and its executor `67850d225384a9541846f5b9`, FDE `e_ai_fde_agent`) or by timestamp. Such a failure is also evidence for that check's verdict; tell the owning agent or fail the check yourself if it already passed.
   - whether the same error signature existed before the deploy. This is a lookup for classification only (`slack_search_public_and_private` on the signature, previous 24 h); the older alert itself is never reported.
3. Classify: **deployment-suspect** (new signature after deploy time, or touches a product under sanity, or matches an error seen in SB/WB/EVAL/FDE), or **pre-existing** (same signature before the deploy). When the cause cannot be determined, say "root cause TBD" and name what to check next; never invent one.
4. Post one reply per new root cause in the results thread (template in `slack-templates.md`; several alerts with one root cause are one post), and record each alert with `sanity_state.py ... alert add <ts> <class> "<name>"`.

Verdict contribution: any deployment-suspect alert makes the final verdict ❌ even if the product checks pass. Pre-existing alerts are listed in the final post but do not change the verdict.
