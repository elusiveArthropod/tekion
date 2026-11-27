# Sanity checks: procedure and pass/fail

Each check is run by its own subagent, in parallel. `<base>` is the platform URL, `<ck>` the cookie file, `<out>` the scratchpad output dir. Scripts live in `.claude/skills/tekion-sanity/scripts/`. Where a selector or API body is marked **discover**, it was not known when this file was written: find it on the first run (read `visibleText`, use `eval` steps, or inspect the page's network calls) and record it in `platform-api.md`.

Common rules:

- Browser steps use `scripts/ua_probe.mjs` and API calls use `scripts/ua_api.sh`, both with the browser session cookie. `scripts/ua_api_hdr.sh` with an `x-ua-at` token is the fallback only when the main session's verification step found the cookie refused by `/api/*`; the agent prompt says which applies.
- Time budgets are hard. Exceeding one is FAIL with note "timed out after N min".
- A login redirect or HTTP 401/403 at any step is AUTH_EXPIRED, not FAIL.
- Every created asset is named `sanity-<env>-<YYYYMMDD-HHMM>` so it can be found and deleted.
- Evidence on FAIL: screenshot path, the error text, the session or run URL.
- **Parallel session-trace monitor.** Every agent-driven check (SB, WFB, FDE-QA, FDE-CRUD) also watches that agent's observability sessions while it runs and for 2 minutes after: poll the sessions page every 60 s with `ua_probe.mjs` (`text` on the session list, then open any session started by this run), and read each trace for error status or text matching `error|exception|failed|timed out|rate limit`. An error trace in a session this run created is a FAIL for that check with the trace URL as evidence, even if the chat reply looked fine. Error traces in sessions this run did not create are reported in the check's note as "other sessions failing: <n>, e.g. <url>" and handed to ALERTS. Sessions pages:
  - Solution Builder team: `<base>/p/0/ai-teams/<teamId>/observability/sessions/all`
  - Workflow Builder agent: `<base>/p/0/ai-agents/e_6aa19955aeb9ea1371af57c7/observability/sessions/all`
  - AI FDE agent: `<base>/p/0/ai-agents/e_ai_fde_agent/observability/sessions/all`

## SB: Solution Builder (AI Teams)

Budget: 60 min for the build, 15 min for the functional check.

Fixed prompt (do not vary between runs unless the user overrides it, otherwise results are not comparable). It is deliberately a medium-size system, not a single form, so that a regression in data modelling, relations, roles, workflow logic or dashboards shows up:

> Build an internal "Vendor Onboarding & Purchase Request" system.
> Entities: Vendor (name, category, country, status Draft/Under Review/Approved/Blocked, contact email, risk score 1-5), Purchase Request (title, vendor, department, amount, currency, needed-by date, justification, attachment file, status Submitted/Manager Approved/Finance Approved/Rejected), Approval Comment (request, author, text, timestamp), Department Budget (department, fiscal year, budget amount, spent amount), and Activity Log (entity, record, action, actor, timestamp).
> Roles: Requester creates and views their own requests; Manager sees all requests of their department and approves or rejects with a mandatory comment; Finance sees Manager-Approved requests above 5000 and gives final approval; Admin manages vendors and budgets.
> Rules: a request can only be submitted against an Approved vendor; a request is rejected automatically with a comment if it would push the department over budget; every status change writes an Activity Log row and sends an in-app notification to the requester; a request Manager-Approved for more than 3 days without Finance action is escalated with a notification to Finance.
> Pages: vendor list with status and risk filters and search; vendor detail with its requests; request list with status, vendor and department filters; request detail with the attachment, the approval comment trail and the activity log; a bulk CSV import page for vendors; a dashboard with total approved amount this month, requests pending per status, budget used per department as a bar chart, and top 5 vendors by approved amount, with export to CSV.
> Automations: a weekly digest listing pending requests per manager; the escalation rule above as a scheduled check.
> Name the solution "sanity-<env>-<stamp>".

Functional assertions on the generated app (all must hold):

1. vendor list page loads and has status and risk filters;
2. create a vendor `sanity vendor` with status Approved; it appears in the list;
3. create a purchase request `sanity request`, amount 100, department Finance, against that vendor; it appears with status Submitted;
4. a request against a Draft vendor is refused or not offered (create a second vendor in Draft and try);
5. the request detail page shows the attachment field, a comment trail section and an activity log with at least the "created" row;
6. approve the request as Manager without a comment: refused; with a comment: status becomes Manager Approved and the activity log gains a row;
7. the dashboard page loads, shows the pending-per-status figure including the new request, and has a budget-per-department chart;
8. the solution contains two automations (weekly digest, escalation check), both present in its automation list.

Procedure:

1. Open `<base>/p/0/ai-teams/<teamId>` with `ua_probe.mjs`. Confirm the team page loads (not login, no `apiErrors`). **Discover** the prompt input selector for starting a new build; submit the fixed prompt with `fill` + `press Enter` (or the send button).
2. Record the new session. Open `<base>/p/0/ai-teams/<teamId>/observability/sessions/all` and locate the session started in the last few minutes (`GetAllSessions` body pattern in `platform-api.md` once captured). Save its URL as evidence.
3. Poll the session every 2 min with `ua_probe.mjs` (`text` on the trace list). Collect any step whose status is error, any text matching `error|exception|failed|timed out`, and the final session state.
4. When the build completes, open the generated app (link from the session or the team's solutions list) and run the eight functional assertions above with `ua_probe.mjs` actions. Record which ones passed in the note, e.g. `functional 7/8, failed: #4 draft-vendor guard`.
5. Delete the solution (UI or API, **discover**). If deletion is not possible, say so in the note.

PASS: build completed within budget, no error steps in the session trace, all eight functional assertions true.
FAIL: build did not complete, or any error step in the trace, or any functional assertion false. Note must say which. The session URL is the primary evidence; an error step inside it is also a lead for ALERTS (same agent/knowledge/application may be failing elsewhere).

## FDE-UI: AI FDE copilot panel (the surface users actually see)

Budget: 5 min.

The AI FDE that users talk to is the **copilot panel** opened from the `✦ AI FDE` button in the platform's top bar. Its greeting is "Hey, I'm AI FDE" / "I can help you do your best work" and it shows starter chips (seen 2026-11-25: "How do I convert or merge files (PDF, Excel)?", "How do I write an analytics SQL query?", "How do I map a data pill?"). These starters are configured on the **copilot**, not on the agent entity: `GET /api/entity/ai_agent/e_ai_fde_agent` has `conversationStarters: []` and the agent's `/test` page shows no chips. Do not judge starters from the agent config page or the `/test` page; that was the false FAIL of 2026-11-25.

1. `ua_probe.mjs --url <base>/p/0/ai-agents/<agentId>/configuration/instructions`: must load without login redirect, `apiErrors` empty, `visibleText` contains the instructions (non-empty). This is the "agent exists and is configured" half.
2. Open any platform page that shows the top bar (the same instructions URL is fine) and click the top-right `AI FDE` button: action `{"type":"click","selector":"text=AI FDE"}` (**discover** and record the stable selector if `text=` matches more than one element; a `role=button[name=/AI FDE/]` form is the next thing to try). Then `waitForText` `Hey, I'm AI FDE` with a 30 s timeout, `screenshot`, and capture the chips:
   `{"type":"eval","js":"[...document.querySelectorAll('button, [role=button], a')].map(e=>e.innerText.trim()).filter(t=>/^How do I|\?$/.test(t))"}`
3. Starters present = the eval returns at least one string, or `visibleText` contains at least one of the chip texts above.

PASS: instructions page loads cleanly, the panel opens with its greeting, at least one starter chip visible.
FAIL: panel does not open, greeting missing, or zero chips. Screenshot plus `apiErrors` are the evidence. If the panel opens but the chips are gone, say so explicitly: that is a copilot configuration regression, not a page failure, and still a FAIL.

## FDE-QA: two platform questions to the AI FDE

Budget: 4 min per question. General platform how-to questions; never ask the agent to create or change anything.

Default questions:

1. `How can I configure an API connection to an external REST service in this platform?`
2. `How do I schedule an automation to run every day at 9 AM?`

Ask through the **copilot panel** (open it as in FDE-UI; input placeholder "Ask anything..."). If the panel cannot be driven, fall back to the agent test page `<base>/p/0/ai-agents/<agentId>/test?chatId=new` (input `div[contenteditable='true'][role='textbox']`, send with Enter) and say in the note which surface was used.

Reply capture (verified 2026-11-25 on the test page): there is no stable per-message selector. The agent first shows a tool line ("Let's make use of the tool Ask From Knowledge", 18 to 24 s), then "Generating response…", then the answer ending with "Response has been generated". Wait for that end marker (`waitForText`, 240 s), allow 5 s to settle, then `text` on `body` and slice after the echoed question. Do not `waitForText` on an answer term; it fires while the tool call is still running.

Acceptance per question (all three):

- a reply arrived within budget and is at least 40 words;
- it contains no error text (`something went wrong`, `error`, `failed to`, `try again later`, stack trace);
- it mentions at least two of the expected terms: Q1 `connector|connection|REST|API|authentication|endpoint`; Q2 `schedule|trigger|cron|daily|automation|time zone`.

PASS: both questions accepted. FAIL: either not. Quote the reply (first 40 lines) in the evidence.

## WFB: Workflow Builder agent (inside a throwaway automation's editor)

Budget: 20 min. Agent id `e_6aa19955aeb9ea1371af57c7`; sessions `<base>/p/0/ai-agents/e_6aa19955aeb9ea1371af57c7/observability/sessions/all`.

The Workflow Builder is used from inside an automation's editor, not as a standalone chat. The check creates its own automation to work on, so no existing automation is ever touched. The editor flow, definition API and copilot selectors are recorded in `platform-api.md` (WORKFLOW BUILDER section); use them, do not rediscover. The 26 Nov run spent 20 of its 37 minutes on discovery and failed on budget for that reason.

Node choice: there is no "Log" app in the node picker (search "Log" only matches Logik / Sumo Logic), so every step this check adds is a **Groovy code node** (app "Code by UnifyApps", action "Execute Groovy code"), which exists on every tenant.

Setup:

1. Create a new automation named `sanity-<env>-<stamp>-wfb` (UI flow in `platform-api.md`) with an API (callable) trigger and two steps: a Groovy code step titled `step one` whose script is `return "step one"`, then a Delay step of 1 second (pick the `Seconds` option with `[role='option']:text-is('Seconds')`; `has-text` matches Milliseconds). Save. Do not activate or publish it. Snapshot the definition with `GET /api/workflow-definition/<id>` (nodes and edges) and screenshot the editor.

Part A, understand (one chat):

2. Open the Workflow Builder copilot inside the editor (`button[aria-label='Copilot']`; URL gains `?b_9U8If-chatId=<id>&nav=copilot`).
3. Ask: `Explain this automation: its trigger, each node in order, and what each node does.`
4. Ask: `What does the Delay node wait for, and what runs before it?`
5. Accept Part A if both replies arrive within 4 min each, the explanation names the API trigger and both nodes in order, the detail answer says 1 second and names the `step one` code node, and neither reply contains error text.

Part B, make (one CRUD operation on the automation), **in a fresh chat**:

6. Reload the builder URL **without** the `chatId` parameter and open the copilot again so a new chat starts (the URL must show a different chatId than Part A). Never reuse the Part A chat here: on 26 Nov the resumed chat answered from the version-1 definition it had seen earlier and the check could not tell a stale read from chat memory. Ask: `Add a new Groovy code node after the Delay node whose script is return "sanity node ok". Do not change any existing node and do not activate or publish the automation.`
7. Verify in the definition (`GET /api/workflow-definition/<id>`) and in the editor that exactly one new node exists at the end, of Groovy code type (`context.appName` code / `resourceName` groovy), with that script, and that the trigger and the two original nodes are unchanged (diff against the step 1 snapshot). The agent's own "done" message is not verification. If the agent describes a definition version older than the saved one (for example says there is no Delay node), that is a FAIL with the reply quoted: in a fresh chat it can only come from a stale definition read.
8. In the same fresh chat ask: `Remove the node you just added.` Verify the definition is back to the snapshot. If the agent cannot, note it; the whole automation is deleted next anyway.

Cleanup:

9. Delete the automation (`POST /api/workflow-definition/delete/<id>`) and confirm `GET` returns 404 or a 500 "not found".

Parallel: the session-trace monitor from the common rules, on the Workflow Builder sessions page, for the whole check.

PASS: automation created, Part A accepted, the node added exactly as asked with nothing else changed, no error traces in this run's sessions, automation deleted.
FAIL: setup failed, a wrong or missing explanation (naming nodes that do not exist is a FAIL), the node not added or added wrongly, any original node changed, a stale definition described in the fresh Part B chat, or an error trace. Removal failing in step 8 is a note, not a FAIL, since the automation is deleted. Deletion failing is a PASS with "not deleted: <url>" in the note. Evidence: the agent session URLs from observability (Part A and Part B are two sessions), before/after screenshots, the diff.
SKIPPED only if the user says the Workflow Builder is absent in this tenant.

## FDE-CRUD: AI FDE create, read, update, delete on a test object and its records

Budget: 20 min. Runs after FDE-QA on the same surface. The check creates its own object, named with the run stamp, and only ever refers to it by that name; it snapshots the tenant's object list before and after so an edit to anything else is caught, not assumed.

Default target: a **custom object with records** (the FDE's goal text says it acts on Storage objects). If the first run shows the FDE cannot create objects, record in `platform-api.md` what it can create and switch the default to that.

Queries, in order, each with a 4 min budget and the same reply-capture rules as FDE-QA. Verification is by API or UI (**discover** the object and record entity types; record them), never by the agent's word.

| # | Query | Verify |
|---|---|---|
| C1 | `Create an object named "sanity_<stamp>" with fields: name (text), amount (number), status (text).` | object exists with the three fields |
| C2 | `Add two records to "sanity_<stamp>": name "alpha", amount 10, status "open"; and name "beta", amount 20, status "closed".` | two records with those values |
| R | `List all records of "sanity_<stamp>" with status "open".` | reply contains alpha only |
| U | `Update the record named "alpha" in "sanity_<stamp>": set amount to 15 and status to "closed".` | alpha has amount 15, status closed; beta unchanged |
| D1 | `Delete the record named "beta" from "sanity_<stamp>".` | one record left, alpha |
| D2 | `Delete the object "sanity_<stamp>" and all its records.` | object gone |

If the FDE asks for confirmation before a write, answer `Yes, proceed.` once; a second confirmation request counts as the step not completing.

Parallel: the session-trace monitor from the common rules, on the AI FDE sessions page, for FDE-QA and FDE-CRUD together.

PASS: all six verified, the object list diff shows only the test object appearing and disappearing, no error traces in this run's sessions.
FAIL: any step unverified, any change outside the test object, an error trace, or any error. If the FDE refuses writes by design, report FAIL with the refusal quoted; the user decides whether to reduce the check to read-only. If D2 fails, delete the object by API or UI and say so.

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

Window: from `alert_since` until all of: `window_min` elapsed, all product checks terminal, and at least 10 minutes since the last product check finished (one full alert-poster cycle plus margin, so runs triggered by SB, FDE-QA and EVAL have had time to be reported).

Tick every 5 minutes. Each tick:

1. `slack_read_channel` on the alert channel with `oldest` = max(`alert_since`, ts of the last recorded alert). Ignore messages already in `state.json → alerts`. If the channel shows nothing new, that is a normal tick, not a problem; the poster may simply not have run yet.
2. Only **failed** runs count. A "Node In Progress" or still-running alert is not a failure: note it once in the tick's state as pending and report it only if the same run is still in progress 15 minutes later or turns into a failure. Do not post an alert reply for a run that is merely in progress (the 25 Nov run posted two of these; they were noise).
3. For each new failed-run alert: read its thread. Open the run or session link with `ua_probe.mjs`; capture `visibleText` of the failing step. Extract:
   - automation / agent name and the failing node;
   - the exact error message;
   - the parent: which agent, knowledge base, application, connector or data source the failing node depends on (read the node's configuration or the trace input/output);
   - whether it was triggered by one of this run's product checks (the SB session, the EVAL experiment, an FDE question): match by asset name `sanity-<env>-<stamp>`, agent id or timestamp. Such a failure is also evidence for that check's verdict; tell the owning agent or fail the check yourself if it already passed.
   - whether the same error signature existed before the deploy. This is a lookup for classification only (`slack_search_public_and_private` on the signature, previous 24 h); the older alert itself is never reported.
4. Classify: **deployment-suspect** (new signature after deploy time, or touches a product under sanity, or matches an error seen in SB/EVAL/FDE), or **pre-existing** (same signature before the deploy). When the cause cannot be determined, say "root cause TBD" and name what to check next; never invent one.
5. Post one reply per new alert in the results thread (template in `slack-templates.md`), and record it.

Verdict contribution: any deployment-suspect alert makes the final verdict ❌ even if the four product checks pass. Pre-existing alerts are listed in the final post but do not change the verdict.
