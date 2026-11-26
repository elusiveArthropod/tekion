# UnifyApps platform: verified API calls and discovered UI details

API calls: `scripts/ua_api.sh <base> <cookie-file> <METHOD> <path> [json-body]` with the browser session cookie (default), or `scripts/ua_api_hdr.sh <base> <token-file> ...` with an `x-ua-at` token (fallback; see AUTH MECHANISM). Exit 2 means the credential is dead.

## Verified (from the eval-setup work, Tekion P2P assistant)

| Action | Call |
|---|---|
| Read entity | `GET /api/entity/<entityType>/<id>` |
| Update field | `POST /api/entity/<entityType>/update/<id>` body `{"operations":[{"field":"properties.<path>","type":"SET","values":[v]}]}` → 204. Use `values`; `value` clears. PUT/PATCH → 405. |
| Create entity | `POST /api/entity` body `{"entityType":"<type>","properties":{...}}` |
| Search | `POST /api/entity/<entityType>` body `{"filter":{"field":"properties.datasetId","op":"EQUAL","values":["<id>"]},"page":{"limit":50,"offset":0}}` |
| Delete | `POST /api/entity/<entityType>/delete/<id>` |

Entity types:

- `dataset`: `properties.name`, `type:"LLM"`, `description`, `visibleFields:["properties.input","properties.expected_output","properties.context","properties.metadataFields.testCaseId"]`.
- `llm_test_case`: `properties.datasetId` (required), `dataset_ids:[dsId]`, `input`, `expected_output`, `context`, `metadataFields:{"testCaseId":"S-01"}`, `expected_tools:[]`, `tools_called:[]`, `actual_output:""`, `retrieved_context:""`, `cost:0`, `latency:-1`.
- `e_ai_evaluation_metric`: `properties.metricConfig.evaluationCriteria`, `evaluationType` (`SCALE`|`BINARY`), `evaluationParameters`, `metricConfig.model`.

Observability:

- Agent sessions list: the UI POSTs `/api/workflow/execute/node?name=GetAllSessions`; capture the body from the page and re-POST with your own `startTime`/`endTime`/`limit`/`offset`. Each session: `firstMessage`, `lastMessage`, `customerName`, `startTime`, `traceCount`, `sessionId`.
- Traces: `fetchTraces` node, same pattern. Each trace: `input`, `output`, `startTime`, `customerName`.
- Experiment run results: the run page fetches a URL containing `test_case_runs`; the response has `objects[]` with `columns`: `metadataFields.testCaseId`, `testCaseId`, `actualOutput`, `result`, `toolsCalled`, `metricScores[]` (`metricId`, `score`, `result`, `reason`).

IDs look like `e_<24 hex>`; the UI puts them in `location.pathname`.

## Known URLs (Pre-prod finance tenant)

- Base: `https://finance.toc.tekioncloud.xyz`
- AI Teams (Solution Builder) team: `/p/0/ai-teams/e_69a84345925f136d9c9e437e`; sessions: `.../observability/sessions/all`
- FDE agent config: `/p/0/ai-agents/e_ai_fde_agent/configuration/instructions`; sessions: `/p/0/ai-agents/e_ai_fde_agent/observability/sessions/all`
- Workflow Builder agent: `e_6aa19955aeb9ea1371af57c7`; sessions: `/p/0/ai-agents/e_6aa19955aeb9ea1371af57c7/observability/sessions/all`. Used from inside an automation's editor (panel selector: TBD). The sanity check creates its own automation to use it on (create flow: TBD).
- Evaluation: `/p/0/evaluation/...`

## To discover on the first run (record here once found)

| Item | Status |
|---|---|
| Solution Builder: prompt input selector and send action | **Found 2026-11-26.** Chat surface: team page "Preview" → `/p/0/ai-teams/<teamId>/test?b_RurcA-chatId=new` (title "Test Agent Copilot"), openable directly (the Preview click shows a false-positive AUTH_EXPIRED via `returnTo=` in the SPA URL). Input `div[contenteditable='true'][role='textbox']` (tiptap, aria-label "Ask a question"); `fill` takes the multi-line prompt; send = `press Enter`. URL then becomes `…chatId=<sessionId>` = observability session id; the generated interface id is `e-<same hex>`. Flow: turn 1 `RequestClarification` (questions NOT rendered in chat; read via `[aria-label='View message trace']` or the session trace, Monaco `monaco.editor.getModels().map(m=>m.getValue())`), answer in plain text; turn 2 "Application Plan" with `button:has-text('Approve')`; build ~30 min for the fixed prompt (trace latency 30m26s, ~41M tokens). Completion = summary with "Design Choices"/"Notes", no app link in chat. |
| Solution Builder: how to list and delete a solution (UI path or entity type) | **Found 2026-11-26.** The build produced NO `e_solution` (UI `/p/0/solutions`; props `name,description,status,planId,approvedPlanId,globalPlan,modelEntityId`). It produced: (a) an **interface** `e_interface` id `e-<sessionHex>` — list `/p/0/interfaces`, detail `/p/0/interfaces/<id>/overview`, search `POST /api/entity/e_interface {"filter":{"field":"properties.name","op":"CONTAINS","values":["sanity"]}}`, delete `POST /api/entity/e_interface/delete/<id>` → `true` (GET → 404); (b) **automations** tagged "AI Generated" — NOT an `/api/entity` type; definition `GET /api/workflow-definition/<id>`, delete `POST /api/workflow-definition/delete/<id>` → `true` (GET → 500 5002 not found), or UI `/p/0/automations` row kebab (only `button` in the row) → `Delete` → dialog "Delete Automation?" → `Delete`; (c) **storage objects** with unstamped names (Vendor, Purchase Request, …) at `/p/0/objects/custom` — ids are slugs (`vendor`, `purchase_request`), records API `POST /api/entity/<slug>`; delete via the list row kebab → `Delete` → dialog "Delete Object?" → `Delete` (verified: `POST /api/entity/<slug>` then 500 5002 "ENTITY_TYPE … not found"). Snapshot the objects list before the build to know which ones to delete. App runtime host `https://<interfaceId>-finance.toc.tekioncloud.xyz/<slug>` is blocked by the sandbox egress proxy (ERR_TUNNEL_CONNECTION_FAILED); `/p/0/<interfaceId>/<slug>` is 404 — functional assertions #1–#6 need that host allow-listed. |
| `GetAllSessions` request body for the AI Teams sessions page | Still not captured (2026-11-26: fetch/XHR patch saw nothing; different transport). Workaround: sessions list rows are `<tr>`, case id = last 6 hex of the session id; `waitForText` on the case id then click the first `td` → `/observability/sessions/<sessionId>/traces/<traceId>?timelineId=<traceId>`. Trace step status word (Success/Error) appears before "START"; tool input/output are Monaco editors. |
| FDE agent: chat/test surface URL and reply container selector | **Found 2026-11-25.** "Preview" top-bar button (CSS `text=Preview`, no href) navigates to `/p/0/ai-agents/<agentId>/test?...chatId=new` (title "Test Agent Copilot"); openable directly via that `/test` URL. Chat input: contenteditable `.tiptap.ProseMirror` with placeholder "Ask a question" — robust selector `div[contenteditable='true'][role='textbox']` (aria-label "Ask a question"); playwright `fill` works, send with `press` Enter. A transient AUTH_EXPIRED (probe exit 2) can appear during the Preview-click SPA navigation as a false positive; confirm by loading `/test` directly. Reply container (verified 2026-11-25 FDE-QA): no stable per-message class (markdown/prose/message selectors return 0); the answer streams into `document.body.innerText` — agent first shows a tool line (e.g. "Let's make use of the tool Ask From Knowledge", ~18-24s), then "Generating response…", then the answer ending with "Response has been generated". Capture via `body` innerText and slice after the echoed question; allow ~90s settle before capturing (waitForText on a short answer term fires too early, while the RAG tool call is still running). |
| FDE agent: conversation starter chip selector | **Corrected 2026-11-25.** The agent entity has no starters (`conversationStarters: []`, Instructions page shows one empty "Start typing…" slot) and that is expected. The starters users see belong to the **AI FDE copilot panel**, opened by the `✦ AI FDE` button in the platform top bar: greeting "Hey, I'm AI FDE", subtitle "I can help you do your best work", chips "How do I convert or merge files (PDF, Excel)?", "How do I write an analytics SQL query?", "How do I map a data pill?", input placeholder "Ask anything...". **Selectors verified 2026-11-26:** top-bar button `button.MuiButton-root:has-text("AI FDE")` (bare `text=AI FDE` is ambiguous: breadcrumb `<p>` and header `<h6>`; `:text-is` did not match); JS fallback `[...document.querySelectorAll('button.MuiButton-root')].find(b=>b.innerText.trim()==='AI FDE').click()`. Wait for it up to 60 s. Greeting `<h4>` uses a curly apostrophe (U+2019), so `waitForText "Hey, I'm AI FDE"` with a straight quote times out — wait for "I can help you do your best work". Chips are NOT buttons: `div.MuiStack-root.rounded-full > p.ua-typography`; eval `[...document.querySelectorAll('p.ua-typography')].map(e=>e.innerText.trim()).filter(t=>/^How do I|\?$/.test(t))`; chips are page-context aware (agent page: "How do I index knowledge for RAG?", "How do I add tools to this agent?", "How do I evaluate this agent?"). Opening the panel adds `?b_9U8If-chatId=new`; after the first message `chatId=e_<id>`. Reload `/p/0/ai-agents/custom?b_9U8If-chatId=<id>` then click the button to restore that chat with history. Panel input `div[contenteditable='true'][role='textbox']` (placeholder "Ask anything..."). Reply capture on the panel: poll `document.body.innerText` until the COUNT of "Response has been generated" exceeds the count at send time (earlier replies keep their marker), wait 5 s, `text body`, slice after the last echo of the question. `/p/0/` and `/p/0/overview` are 404 with no top bar: use `/p/0/ai-agents` or the FDE instructions URL. Every agents-page load fires `POST /api/workflow/execute/node?name=fetch_current_case&requestId=e_6a0d729880830b496b7bfdaa` → 500 (harmless; exclude from `apiErrors` assertions). Sentry ingest 429s are noise. |
| Experiment entity type, create body and "run" call | **Found 2026-11-25.** Entity type `experiment`. Detail/runs UI: `/p/0/evaluation/experiments/<id>/runs`. Create: `POST /api/entity` body `{"entityType":"experiment","properties":{"name":"<stamp>","dataset_ids":["<dsId>"],"agentId":"<agentId>","task":{"aiAgentId":"<agentId>","version":"-1","task":"agent"},"skipApprovalBeforeToolExecution":true,"metrics":[{"metricId":"<metricId>"}],"concurrency":10}}` → 200 with new `experiment` id. Run trigger: the "Start Run" button fires `GET /api/workflow/execute/node?name=call_automation` (UI node call; not re-run from the API in this check). Poll runs via `POST /api/entity/experiment_runs {"filter":{"field":"properties.experimentId","op":"EQUAL","values":["<expId>"]}}` → each run has `status` (`running`/`completed`), `successCount`, `failureCount`, `totalTestCases`, `runId`. Per-case: `POST /api/entity/test_case_runs {"filter":{"field":"properties.experimentId","op":"EQUAL",...}}` (experimentId filter is REQUIRED; runId-only 500s) → objects with `metadataFields.testCaseId`, `actualOutput`, `metricScores[]` (`metricId`,`score`,`result`,`reason`). |
| Whether a `/api/entity/<type>/<id>` GET on a deleted entity returns 404 or an empty body | **Found 2026-11-25.** After `POST /api/entity/<type>/delete/<id>` (returns `true`), a GET usually returns HTTP 404 `{"message":"Entity not found"}` (seen for `experiment`, `dataset`, `llm_test_case`). One `llm_test_case` GET instead returned HTTP 500 `{"errorCode":5002,"message":"<type> with id <id> not found"}` — also means deleted. Treat either as gone. |

Record exact selectors, bodies and the date verified. Replace TBD; do not append duplicates.

## AUTH MECHANISM (verified 2026-11-26)

- **Browser session cookie** (the full `Cookie:` request header from DevTools on any platform page) authenticates every HTML/SPA route (`/p/0/...`). Without it, pages redirect server-side to `/login`. `ua_probe.mjs` needs it.
- **Verified 2026-11-26:** the browser cookie is `_at=2_<uuid>_00` (plus a PostHog cookie); `ua_api.sh` with the cookie file returns HTTP 200 on `POST /api/entity/dataset`, and `ua_probe.mjs` opens `/p/0/...` with it. The same `2_<uuid>_00` value sent bare (no `_at=` name) does not open UI pages (login redirect) but works as the `x-ua-at` header. So the one credential serves both surfaces; ask the user for the `Cookie:` header (or the `_at` cookie value) and store it as `_at=<value>`. No token file is needed.
- **API token** `2_<uuid>_00`, sent as header `x-ua-at`, authenticates `/api/*` on its own (`ua_api_hdr.sh`). It does not work as a cookie and does not open UI pages. It is a fallback, asked for only if the browser cookie is refused by `/api/*`.

## Verified entity shapes (API token, 2026-11-24)

- Experiment entity type is `experiment`. Create body:
  `{"entityType":"experiment","properties":{"name":..,"dataset_ids":[dsId],"agentId":"e_ai_fde_agent","task":{"aiAgentId":"e_ai_fde_agent","version":"-1","task":"agent"},"metrics":[{"metricId":"<id>"}],"concurrency":5,"skipApprovalBeforeToolExecution":true}}` → 200.
  Read props: `dataset_ids, agentId, task, metrics[].metricId, name, lastRunStatus, runCount, lastRunOn, concurrency, schedulerConfig`.
- Metrics (`e_ai_evaluation_metric`) exist, e.g. Answer Relevancy (SCALE) `e_6ae06cf9d4501754c758f443`.
- FDE agent read: `GET /api/entity/ai_agent/e_ai_fde_agent` → 200. `properties.instructions` ~14KB (non-empty). `properties.conversationStarters` is `[]` (none configured); `responseGenerationSettings.sendSuggestedQueries: true`.
- Delete: `POST /api/entity/<type>/delete/<id>` → 200. GET after delete returns 404 (sometimes 500), never the object.

## Still UI-gated (NOT a REST path; needs the browser session, 2026-11-24)

| Item | Finding |
|---|---|
| Experiment RUN trigger | No REST path. `/api/entity/experiment/{run,execute,start,trigger,action}/<id>` all 404. `/api/workflow/execute/node` exists (500 on bad body) but the node name/body is internal, captured only from the evaluation UI's network tab. |
| Automation run detail / error | `/api/automation/.../runs/<id>` and variants all 404. Run error text is only on the UI run page. |
| Solution Builder build start + session trace | UI only. |
| FDE chat surface + conversation-starter chips | UI only. |


## Workflow Builder (verified 2026-11-26, WFB check)

- Automation create (UI): `/p/0/automations/ai-create` → click `text=Create manually` → fill `input[placeholder='Enter name']` → button "Create automation" (Playwright click is intercepted by `div.absolute.inset-0.z-10.bg-workspace`; use JS `.click()`). Editor `/p/0/automations/<24-hex>/builder`.
- Definition `GET /api/workflow-definition/<id>` → `{name, version, nodes[{id,type:START|ACTION|DELAY|STOP,title,subTitle,context{appName,resourceName},inputs,options{logConfig}}], edges[{fromNodeId,toNodeId,type:"next"}]}`. Same-origin `fetch` inside a probe `eval` works. Trigger types: App Trigger, Callable (the "manual" one), Schedule, Webhook. No dedicated Log node: Log = `utility_by_unifyapps_resolve_value` ACTION with `options.logConfig.logPolicies[{level:INFO,message}]`; Delay = `delay_for` (`inputs{duration,unit:"SECONDS"}`); a Callable trigger adds a STOP node `callables_return_to_automation`.
- Workflow Builder panel: `button[aria-label="Copilot"]` in the left rail (JS click). Do NOT load the `?nav=copilot` URL directly (renders unstyled). The first open may show "Something went wrong. Please try again / Failed to load" — reload the builder URL and click again (seen once 2026-11-26). Chat input `div[role=textbox]`, send Enter; replies end with "Response has been generated"; explain ~10 s, add/remove node ~10 s, agent-built setup ~90 s. The chat `chatId=e_<id>` last 6 hex = SESSION column on the agent's observability page.

## FDE storage objects (verified 2026-11-26, FDE-CRUD)

- The FDE CAN create objects (tools: Create Or Update Object, Read Object, Create Records, Read/Delete Records, Delete Object; only the object delete asked for confirmation). Objects Manager `/p/0/objects/custom` (first headless load may show "Failed to load"; reload). Object ids: `obj_xxxxx` for FDE-created, slugs for SB-created. Records entity type = the object id: `POST /api/entity/<objId> {"page":{...}}`. No REST list of object definitions found (UI uses `POST /api/aggregation?entityType=EntityType&group=STANDARD`, body unknown); snapshot via UI text. After D1 the FDE's own unfiltered count/list returned empty while the API showed 1 record (storage tool count/list oddity, 2026-11-26).

## Automation run pages (verified 2026-11-26, ALERTS)

- The alert's run URL auto-opens the failing step's panel and rewrites to `…runs/<runId>?activeStep=<stepKey>`; panel header "<Action> via <App>", "This step took Nms to execute", tabs Input | Errors | Details. `waitForText "This step took"` + 3 s before reading (8 s default is not enough under load). Step cards are `button`s starting "N.\u00a0<name>"; the failing one carries "1 error". Card "1." (trigger) shows the trigger input: `caseId` (= AI Teams/agent session id), `agentId`, `taskId`, `interfaceId`; Callable steps add `automationId`, `parentWorkflowId`, `parentExecutionId` and a "View Run" link to the sub-automation.
- Input/Errors editors are CodeMirror 6: `Array.from(document.querySelectorAll('.cm-content')).map(e=>e.cmView.view.state.doc.toString())` (body innerText only has visible lines). Tab switch: click the leaf element whose innerText === 'Errors'.
- Runs list `/p/0/automations/<id>/runs`: "Run History <count>", rows EXECUTED ON / STATUS / DURATION (UTC). Title page `/p/0/automations/<id>` → `/preview` shows name + tags (resolves `parentWorkflowId`).
- Caution: "Get Block Or Page Screenshot" node input embeds the `_at` token in `arguments.cookie` — never paste that input into Slack.
- Alert channel format (#tekion-uat-alert, bot "unifyApps"): attachment text with `*Environment:* Finance|Main`, `*Workflow Name:*`, `*Workflow ID:*`, `*Execution Count (last window):*`, `*View Runs:* <url>`; "Node In Progress Alert" posts come from the same bot with an hourglass. Environment Main alerts are for the other tenant.

## Known platform defects surfaced 2026-11-26 (PRE-PROD finance; check before classifying as new)

- Emit Page Creation (69bc0ec092322f0bfae57d62, text-to-lowcode) → Simple Call LLM / Call LLM (AI Agent): "Invalid LLM model: modelId 'e_69aeb0831adff145d2eb5885' not found".
- Invoke Workflow editor Agent (69ed07baf030124253b7dea1): Groovy step "get workflowId, host" → "No such property: runtimeContext for class: Script_…" (fails in ms, before any agent work; triggered by SB when editing a generated callable).
- Node Failure Alert / (copy) alerting automations: "LOKI_SERVER with id LOKI_SERVER:PRIMARY:2 not found" and "CONNECTION with id 69f20262f645325bf39bb253 not found" (Slack Get user info by email) — they fail whenever they have failed runs to report.
- Solution Builder build: Create Page errorCode 5011 "Parent e_component:<page>_<sessionId> not found while resolving permissioned ancestor of e_data_source" (9/17 pages), preview screenshot "Page … not found in interface", generated dashboard SQL "Parameter index out of range (4 > number of parameters, which is 3)".
