# Sanity checks: procedure and pass/fail

Each check is run by its own subagent, in parallel. `<base>` is the platform URL, `<ck>` the cookie file, `<out>` the scratchpad output dir. Scripts live in `.claude/skills/tekion-sanity/scripts/`. Where a selector or API body is marked **discover**, it was not known when this file was written: find it on the first run (read `visibleText`, use `eval` steps, or inspect the page's network calls) and record it in `platform-api.md`.

Common rules:

- API calls use the API token via `scripts/ua_api_hdr.sh` (`x-ua-at` header). Browser steps use the browser session cookie via `scripts/ua_probe.mjs`. They are different credentials; see `platform-api.md` → AUTH MECHANISM.
- Time budgets are hard. Exceeding one is FAIL with note "timed out after N min".
- A login redirect or HTTP 401/403 at any step is AUTH_EXPIRED, not FAIL.
- Every created asset is named `sanity-<env>-<YYYYMMDD-HHMM>` so it can be found and deleted.
- Evidence on FAIL: screenshot path, the error text, the session or run URL.

## SB: Solution Builder (AI Teams)

Budget: 30 min for the build, 5 min for the functional check.

Fixed prompt (do not vary between runs unless the user overrides it, otherwise results are not comparable):

> Build an internal expense reimbursement tracker. Employees submit an expense with title, amount, category (Travel, Meals, Equipment, Other), date and a note. Managers see a list of all expenses with a status filter (Submitted, Approved, Rejected) and can approve or reject each one with a comment. Show a summary card with the total approved amount. Name the solution "sanity-<env>-<stamp>".

Procedure:

1. Open `<base>/p/0/ai-teams/<teamId>` with `ua_probe.mjs`. Confirm the team page loads (not login, no `apiErrors`). **Discover** the prompt input selector for starting a new build; submit the fixed prompt with `fill` + `press Enter` (or the send button).
2. Record the new session. Open `<base>/p/0/ai-teams/<teamId>/observability/sessions/all` and locate the session started in the last few minutes (`GetAllSessions` body pattern in `platform-api.md` once captured). Save its URL as evidence.
3. Poll the session every 2 min with `ua_probe.mjs` (`text` on the trace list). Collect any step whose status is error, any text matching `error|exception|failed|timed out`, and the final session state.
4. When the build completes, open the generated app (link from the session or the team's solutions list). Functional check, via `ua_probe.mjs` actions:
   - the app's main page loads with a list/table and a create action visible;
   - create one expense (title `sanity check`, amount 12.5, category Travel);
   - the new row appears in the list;
   - the status filter exists.
5. Delete the solution (UI or API, **discover**). If deletion is not possible, say so in the note.

PASS: build completed within budget, no error steps in the session trace, all four functional assertions true.
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
2. For each new failed-run alert: read its thread. Open the run or session link with `ua_probe.mjs`; capture `visibleText` of the failing step. Extract:
   - automation / agent name and the failing node;
   - the exact error message;
   - the parent: which agent, knowledge base, application, connector or data source the failing node depends on (read the node's configuration or the trace input/output);
   - whether it was triggered by one of this run's product checks (the SB session, the EVAL experiment, an FDE question): match by asset name `sanity-<env>-<stamp>`, agent id or timestamp. Such a failure is also evidence for that check's verdict; tell the owning agent or fail the check yourself if it already passed.
   - whether the same error signature existed before the deploy. This is a lookup for classification only (`slack_search_public_and_private` on the signature, previous 24 h); the older alert itself is never reported.
3. Classify: **deployment-suspect** (new signature after deploy time, or touches a product under sanity, or matches an error seen in SB/EVAL/FDE), or **pre-existing** (same signature before the deploy). When the cause cannot be determined, say "root cause TBD" and name what to check next; never invent one.
4. Post one reply per new alert in the results thread (template in `slack-templates.md`), and record it.

Verdict contribution: any deployment-suspect alert makes the final verdict ❌ even if the four product checks pass. Pre-existing alerts are listed in the final post but do not change the verdict.
