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
- Workflow Builder agent: `e_6aa19955aeb9ea1371af57c7` (entity name "Workflow Agent"); sessions: `/p/0/ai-agents/e_6aa19955aeb9ea1371af57c7/observability/sessions/all`. Used from inside an automation's editor; see WORKFLOW BUILDER below for the create flow and selectors.
- Same ids on the Main tenant `https://platform.toc.tekioncloud.xyz` (team, FDE agent, Workflow Agent). The Answer Relevancy metric `e_6ae06cf9d4501754c758f443` does NOT exist on Main; `PS360 | Response Quality` `e_6b001fbe357994515aed8118` (SCALE) does.
- Evaluation: `/p/0/evaluation/...`

## To discover on the first run (record here once found)

| Item | Status |
|---|---|
| Solution Builder: prompt input selector and send action | **Found 2026-11-26.** Load `/p/0/ai-teams/<teamId>/test?b_RurcA-chatId=new` directly (the Preview click carries `returnTo=` and trips the probe's AUTH_EXPIRED check as a false positive). Input `div[contenteditable='true'][role='textbox']` (placeholder "Ask a question"); playwright `fill` + `press Enter` works for the multi-paragraph prompt. After send the URL is `?b_RurcA-chatId=<sessionId>` = observability session id. Flow: reply 1 is a clarifying question (rendered WITHOUT options on 26 Nov, console "Dynamic property not found at a path: undefined b_7D1iW"), reply 2 is "Application Plan — Prompt to edit or approve the plan" with `button:has-text('Approve')`; after Approve the Team Manager delegates to Solution Planner (LoadSkill `data-model-and-automations-authoring`, tool `Create Interface`). Budget for 2 interventions. |
| Solution Builder: how to list and delete a solution (UI path or entity type) | **Found 2026-11-26.** Entity type `e_solution`: `POST /api/entity/e_solution {"filter":{"field":"properties.name","op":"EQUAL","values":["<name>"]}}` (also `CONTAINS`; `createdTime` GT filter works). Props: `name`, `description`, `status` (planning/building/built), `globalPlan`, `planId`, `approvedPlanId`, `deploymentState`. Delete: `POST /api/entity/e_solution/delete/<id>`. `solution`, `ai_solution`, `solutions` are not entity types (500 errorCode 5002). UI `/p/0/solutions`, `/p/0/solutions/ai-create`. Note: a re-delegated planner can create the solution with `name` = the whole prompt, so search with CONTAINS on the stamp. |
| `GetAllSessions` request body for the AI Teams sessions page | Body still not captured. UI alternative (2026-11-26): sessions list row click opens a drawer with no URL change; the traces list `/p/0/ai-teams/<teamId>/observability/traces` has columns TRACE ID, CASE ID (= session id suffix), INPUT; trace detail `/observability/traces/<e_traceId>` shows a span timeline; clicking a span shows Success/Error badge plus Input/Output JSON; tool spans link "View Run". For agents (not teams) rows are `tr`; `tr:has-text('<first message>')` opens `/observability/sessions/<sid>/traces/<tid>`, and `goto` to `/observability/sessions/<sid>` works directly. |
| FDE agent: chat/test surface URL and reply container selector | **Found 2026-11-25.** "Preview" top-bar button (CSS `text=Preview`, no href) navigates to `/p/0/ai-agents/<agentId>/test?...chatId=new` (title "Test Agent Copilot"); openable directly via that `/test` URL. Chat input: contenteditable `.tiptap.ProseMirror` with placeholder "Ask a question" — robust selector `div[contenteditable='true'][role='textbox']` (aria-label "Ask a question"); playwright `fill` works, send with `press` Enter. A transient AUTH_EXPIRED (probe exit 2) can appear during the Preview-click SPA navigation as a false positive; confirm by loading `/test` directly. Reply container (verified 2026-11-25 FDE-QA): no stable per-message class (markdown/prose/message selectors return 0); the answer streams into `document.body.innerText` — agent first shows a tool line (e.g. "Let's make use of the tool Ask From Knowledge", ~18-24s), then "Generating response…", then the answer ending with "Response has been generated". Capture via `body` innerText and slice after the echoed question; allow ~90s settle before capturing (waitForText on a short answer term fires too early, while the RAG tool call is still running). |
| FDE agent: conversation starter chip selector | **Corrected 2026-11-25.** The agent entity has no starters (`conversationStarters: []`, Instructions page shows one empty "Start typing…" slot) and that is expected. The starters users see belong to the **AI FDE copilot panel**, opened by the `✦ AI FDE` button in the platform top bar: greeting "Hey, I'm AI FDE", subtitle "I can help you do your best work", chips "How do I convert or merge files (PDF, Excel)?", "How do I write an analytics SQL query?", "How do I map a data pill?", input placeholder "Ask anything...". **Selectors found 2026-11-26.** `text=AI FDE` matches two elements on an agent page (breadcrumb div and the real button); use `button:has-text("AI FDE")` or the right-most `header button` whose text matches /AI FDE/ (eval: `(()=>{const b=[...document.querySelectorAll('header button')].filter(e=>/AI FDE/.test(e.innerText||'')).sort((a,b)=>b.getBoundingClientRect().x-a.getBoundingClientRect().x)[0];b.click();return 'clicked';})()`). Panel container `.ua-copilot-cream-surface`; input `div[contenteditable='true'][role='textbox']` (tiptap, placeholder "Ask anything..."), fill + Enter; opening the panel appends `b_9U8If-chatId=<id>` to the URL (= observability session id; to resume a chat load that URL and click the button, the panel does not auto-open). The greeting apostrophe is U+2019 ("Hey, I’m AI FDE"), so `waitForText` on `I can help you do your best work` instead. Chips are `<p class="ua-typography ...">` inside a rounded MuiStack, NOT buttons: capture with `[...document.querySelectorAll('p')].map(e=>e.innerText.trim()).filter(t=>/^How do I.*\\?$/.test(t))`. Chips are page-context-aware (on an agent page: "How do I index knowledge for RAG?", "How do I add tools to this agent?", "How do I evaluate this agent?"); judge "at least one `How do I …?` chip", never fixed texts. Every page load also fires `POST /api/workflow/execute/node?name=fetch_current_case` → 500 (UI widget bug, ignore for the FDE verdict). Copilot answers in 10–25 s; end marker "Response has been generated" is reliable. |
| Experiment entity type, create body and "run" call | **Found 2026-11-25.** Entity type `experiment`. Detail/runs UI: `/p/0/evaluation/experiments/<id>/runs`. Create: `POST /api/entity` body `{"entityType":"experiment","properties":{"name":"<stamp>","dataset_ids":["<dsId>"],"agentId":"<agentId>","task":{"aiAgentId":"<agentId>","version":"-1","task":"agent"},"skipApprovalBeforeToolExecution":true,"metrics":[{"metricId":"<metricId>"}],"concurrency":10}}` → 200 with new `experiment` id. Run trigger: the "Start Run" button fires `GET /api/workflow/execute/node?name=call_automation` (UI node call; not re-run from the API in this check). Runs page has `Start New Run` (top bar) and `Start Run` (empty state); `text=Start Run` → toast "Successfully Triggered Run", no dialog (2026-11-26). The first `experiment_runs` poll can show `totalTestCases: 0` before populating; `failureCount` counts metric `result:false` cases, not run errors. Poll runs via `POST /api/entity/experiment_runs {"filter":{"field":"properties.experimentId","op":"EQUAL","values":["<expId>"]}}` → each run has `status` (`running`/`completed`), `successCount`, `failureCount`, `totalTestCases`, `runId`. Per-case: `POST /api/entity/test_case_runs {"filter":{"field":"properties.experimentId","op":"EQUAL",...}}` (experimentId filter is REQUIRED; runId-only 500s) → objects with `metadataFields.testCaseId`, `actualOutput`, `metricScores[]` (`metricId`,`score`,`result`,`reason`). |
| Whether a `/api/entity/<type>/<id>` GET on a deleted entity returns 404 or an empty body | **Found 2026-11-25.** After `POST /api/entity/<type>/delete/<id>` (returns `true`), a GET usually returns HTTP 404 `{"message":"Entity not found"}` (seen for `experiment`, `dataset`, `llm_test_case`). One `llm_test_case` GET instead returned HTTP 500 `{"errorCode":5002,"message":"<type> with id <id> not found"}` — also means deleted. Treat either as gone. |

Record exact selectors, bodies and the date verified. Replace TBD; do not append duplicates.

## WORKFLOW BUILDER (automations editor and copilot; verified 2026-11-26, Main tenant)

- Automations list UI `/p/0/automations`; "New Automation" → `/p/0/automations/ai-create`. Manual create: click `text=Create manually`, fill `input[placeholder='Enter name']`, click `button:has-text('Create automation')` → editor `/p/0/automations/<24hex id>/builder?activeStep=<nodeId>` (bare 24-hex id, no `e_`). Create POSTs `/api/workflow-definition`.
- Definition read: `GET /api/workflow-definition/<id>` → `{id,name,version,nodes[],edges[],settings,...}`. Node: `{id,type:"START"|"ACTION"|"DELAY",title,subTitle,context:{appName,resourceName,resourceVersion,type},inputs}`. API trigger: `context:{appName:"callables",resourceName:"callables_from_api"}, trigger:{type:"CALLABLE"}`. Delay: `type:"DELAY", context:{appName:"delay",resourceName:"delay_for"}, inputs:{duration,unit}` (unit MILLISECONDS|SECONDS|…). Edges `{fromNodeId,toNodeId,type:"next"}`. Each save bumps `version`.
- Definition delete: `POST /api/workflow-definition/delete/<id>` → `true`; GET afterwards → 500 errorCode 5002 "WORKFLOW_DEFINITION with id … not found". `DELETE` → 405; `/api/entity/WorkflowDefinition` is not a valid entity route. A definition update API (PUT/POST) is still TBD; setup is UI-driven.
- Editor selectors: trigger picker `button:has-text('Callable')` → `button:has-text('Trigger via API')` (also "Trigger interface", "Trigger via automation"); `button:has-text('Save')` (toast "Automation saved with N error."; "Missing respond node" is non-blocking for callable triggers). Placeholder node `.react-flow__node:has-text('Select an app and action')` opens the app picker: `input[placeholder='Search apps']`, then the action button by text, e.g. `button:has-text('Set delay duration')` or `button:has-text('Execute Groovy code')` (app "Code by UnifyApps"). Delay form: duration `[aria-label='Value']` (data-pill contenteditable: click, then press keys), unit `input[role='combobox']` → `[role='option']:text-is('Seconds')` (`has-text` matches Milliseconds). Add node: `.react-flow__node[data-id='add-node']`. Canvas nodes `.react-flow__node[data-id=<nodeId>]`.
- There is NO "Log" app (search "Log" matches Logik / Higher Logic / Sumo Logic). Use Groovy code nodes for sanity steps.
- Node catalog: `GET /api/workflow-builder/find-nodes-with-connections?...&resourceType=ACTION`; `POST /api/workflow-builder/search-nodes-and-resources`.
- Copilot: `button[aria-label='Copilot']` in the editor top bar → "Chat" panel; URL gains `?b_9U8If-chatId=<e_id>&nav=copilot` (chatId = observability session id). Input `div.tiptap.ProseMirror[contenteditable='true']` (placeholder "Ask anything..."), `fill` + `press Enter`. Reply streams into body innerText: "Thought for Ns, ran a tool" … answer … "Response has been generated"; clarification replies render numbered options plus "Skip". Explain reply < 90 s. A new chat = load the builder URL without `chatId` and click the button; reusing a chatId resumes the old chat and the agent may answer from the definition version it saw earlier.

## STORAGE OBJECTS (FDE-CRUD; verified 2026-11-26)

- UI `/p/0/objects/custom`; object page `/p/0/objects/<objId>/records`. FDE-created object ids look like `obj_xxxxx` (JSON Store/MONGO).
- Object list: `POST /api/aggregation?entityType=EntityType&group=STANDARD` body `{"entityType":"EntityType","group":"STANDARD","includeTotalHits":true,"filter":{"op":"AND","values":[{"op":"OR","values":[{"field":"standard","op":"EQUAL","values":[false]},{"field":"standard","op":"MISSING"}]}]},"sorts":[{"field":"cTm","order":"DESC"}],"projections":[{"name":"name"},{"name":"id"},{"name":"columns"},{"name":"mTm"},{"name":"cTm"}],"page":{"limit":200,"offset":0}}` (offset paging works; `{"field":"name","op":"EQUAL",...}` for one object). `POST /api/entity/EntityType` does not work.
- Fields: `POST /api/lookup?ByQuery=ENTITY_FIELD` body `{"lookupType":"ENTITY_FIELD","type":"ByQuery","options":{"group":"ENTITY","entityType":"<objId>"},"page":{"limit":1000,"offset":0}}` → `properties.<name>` with fieldType TEXT/DOUBLE/….
- Records: `POST /api/entity/<objId> {"page":{"limit":20,"offset":0}}`. After the object is deleted → 500 "ENTITY_TYPE with id <objId> not found".
- The FDE asks one confirmation before deleting an object ("Reply 'yes, delete it'"); `Yes, proceed.` is accepted. Writes complete in 10–25 s.

## ALERT RUN PAGES (ALERTS check; verified 2026-11-26)

- Run page `/p/0/automations/<wfId>/runs/<runId>`: click `text=Errors`, then read `document.body.innerText` from `"errorCode"`; a long node list truncates a `text` capture at 8000 chars, so slice with an `eval`. `text=Input` is ambiguous on long runs (matches node titles); click the tab via an eval that finds the element whose trimmed innerText is exactly `Input`. Runs list `/p/0/automations/<wfId>/runs` shows today's EXECUTED ON / STATUS / DURATION rows (UTC in the headless browser).
- Connections list `/p/0/connections/all`, search `input[placeholder='Search connections']`; `connection`/`connections` are not entity types.
- Solution Builder plumbing seen in alerts: `Execute Custom AI Agent Action` (66e4c220f82132609342c11f) is the agent tool executor; `Create Interface` (69c7676c83243417fcc01216) creates the app and carries the app name in `optimizedPrompt`; `Emit Page Creation` (69bc0ec092322f0bfae57d62) → `Simple Call LLM` → `Call LLM (AI Agent)` is the page pipeline; `(tool) Fetch Objects/Workflow Assets/Generic Entities`, `Default Tools | Execute Code In Sandbox` and `Execute Tool Wrapper` are planner tools. `Node Failure Alert` (69f1f7c6c15f606ee49344a4) and `Node Failure Alert (copy)` (6a0c81eaab316a3f4e4c67fe) are the alert posters themselves and run every 5 min.

## AUTH MECHANISM (verified 2026-11-24 in part; corrected 2026-11-26)

- **Browser session cookie** (the full `Cookie:` request header from DevTools on any platform page) authenticates every HTML/SPA route (`/p/0/...`). Without it, pages redirect server-side to `/login`. `ua_probe.mjs` needs it.
- The platform UI calls `/api/*` with that same cookie (same-origin fetch, no token), so `ua_api.sh` with the cookie file is the default for API calls. **Confirmed 2026-11-26 on Main:** the cookie header `_at=1_<uuid>_00` alone returned HTTP 200 on `POST /api/entity/dataset` and worked for every `/api/*` call of the run; no `x-ua-at` token was needed. The 24 Nov "cookie → 401" test had used the API token value as a cookie.
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
