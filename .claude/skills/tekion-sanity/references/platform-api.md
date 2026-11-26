# UnifyApps platform: verified API calls and discovered UI details

All `/api/*` calls authenticate with the API token header, not the browser cookie. `scripts/ua_api_hdr.sh <base> <token-file> <METHOD> <path> [json-body]` sends the API token as `x-ua-at` (see AUTH MECHANISM below; `ua_api.sh` with a cookie returns 401 and is kept only for reference). Exit 2 means the token is dead.

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
- FDE agent config: `/p/0/ai-agents/e_ai_fde_agent/configuration/instructions`
- Evaluation: `/p/0/evaluation/...`
- Automations list: `/p/0/automations`; builder for one automation: `/p/0/automations/<automationId>/builder`
- Workflow Builder copilot (agent that explains and builds automations): the builder URL with `?nav=copilot` (seen 2026-10-27, the UI adds a `<prefix>-chatId=new` param whose prefix varies). Agent entity on Pre-prod finance: `e_6aa19955aeb9ea1371af57c7`; sessions `/p/0/ai-agents/e_6aa19955aeb9ea1371af57c7/observability/sessions/all`. Its executor automation ("Call LLM (AI Agent) Wrapper" path) is `67850d225384a9541846f5b9`; the TEK-657 "stuck in thoughts" failure logged `Your response does not match the required format` there.
- A safe existing automation to ask the Workflow Builder to explain on Pre-prod finance: `Node Failure Alert - Finance`, `6ab21aea970f873408436c68` (production 5-min poller; read it, never edit it).
- Pause/resume an automation (session cookie plus `Origin: <base>` header, not the API token): `POST /api/workflow-definition/<id>/pause` (toggle). Shows the `/api/workflow-definition/` namespace exists; create and delete bodies are still to discover.

## To discover on the first run (record here once found)

| Item | Status |
|---|---|
| Solution Builder: prompt input selector and send action | TBD |
| Solution Builder: how to list and delete a solution (UI path or entity type) | TBD |
| Workflow Builder: copilot input selector and reply end marker in the builder panel | TBD (first try `div[contenteditable='true'][role='textbox']`, same as the FDE test page) |
| Workflow Builder: canvas node title selector (to count and name nodes) | TBD |
| Automation: create an empty draft (UI create action on `/p/0/automations`, or `POST /api/workflow-definition` body) | TBD |
| Automation: delete a draft (list-page menu, or `POST /api/workflow-definition/<id>/delete`) | TBD |
| Automation: test-run a draft from the builder (button name) | TBD |
| AI FDE: configured tool list (property path on `GET /api/entity/ai_agent/e_ai_fde_agent`, and the tool names) | TBD. Decides whether FDE-CRUD can pass at all on a tenant; record the names here after the first run. |
| `GetAllSessions` request body for the AI Teams sessions page | TBD |
| FDE agent: chat/test surface URL and reply container selector | **Found 2026-11-25.** "Preview" top-bar button (CSS `text=Preview`, no href) navigates to `/p/0/ai-agents/<agentId>/test?...chatId=new` (title "Test Agent Copilot"); openable directly via that `/test` URL. Chat input: contenteditable `.tiptap.ProseMirror` with placeholder "Ask a question" — robust selector `div[contenteditable='true'][role='textbox']` (aria-label "Ask a question"); playwright `fill` works, send with `press` Enter. A transient AUTH_EXPIRED (probe exit 2) can appear during the Preview-click SPA navigation as a false positive; confirm by loading `/test` directly. Reply container (verified 2026-11-25 FDE-QA): no stable per-message class (markdown/prose/message selectors return 0); the answer streams into `document.body.innerText` — agent first shows a tool line (e.g. "Let's make use of the tool Ask From Knowledge", ~18-24s), then "Generating response…", then the answer ending with "Response has been generated". Capture via `body` innerText and slice after the echoed question; allow ~90s settle before capturing (waitForText on a short answer term fires too early, while the RAG tool call is still running). |
| FDE agent: conversation starter chip selector | **Corrected 2026-11-25.** The agent entity has no starters (`conversationStarters: []`, Instructions page shows one empty "Start typing…" slot) and that is expected. The starters users see belong to the **AI FDE copilot panel**, opened by the `✦ AI FDE` button in the platform top bar: greeting "Hey, I'm AI FDE", subtitle "I can help you do your best work", chips "How do I convert or merge files (PDF, Excel)?", "How do I write an analytics SQL query?", "How do I map a data pill?", input placeholder "Ask anything...". Stable button and chip selectors: TBD (first try `text=AI FDE`, then a `role=button` form; chips are buttons whose text ends in `?`). |
| Experiment entity type, create body and "run" call | **Found 2026-11-25.** Entity type `experiment`. Detail/runs UI: `/p/0/evaluation/experiments/<id>/runs`. Create: `POST /api/entity` body `{"entityType":"experiment","properties":{"name":"<stamp>","dataset_ids":["<dsId>"],"agentId":"<agentId>","task":{"aiAgentId":"<agentId>","version":"-1","task":"agent"},"skipApprovalBeforeToolExecution":true,"metrics":[{"metricId":"<metricId>"}],"concurrency":10}}` → 200 with new `experiment` id. Run trigger: the "Start Run" button fires `GET /api/workflow/execute/node?name=call_automation` (UI node call; not re-run from the API in this check). Poll runs via `POST /api/entity/experiment_runs {"filter":{"field":"properties.experimentId","op":"EQUAL","values":["<expId>"]}}` → each run has `status` (`running`/`completed`), `successCount`, `failureCount`, `totalTestCases`, `runId`. Per-case: `POST /api/entity/test_case_runs {"filter":{"field":"properties.experimentId","op":"EQUAL",...}}` (experimentId filter is REQUIRED; runId-only 500s) → objects with `metadataFields.testCaseId`, `actualOutput`, `metricScores[]` (`metricId`,`score`,`result`,`reason`). |
| Whether a `/api/entity/<type>/<id>` GET on a deleted entity returns 404 or an empty body | **Found 2026-11-25.** After `POST /api/entity/<type>/delete/<id>` (returns `true`), a GET usually returns HTTP 404 `{"message":"Entity not found"}` (seen for `experiment`, `dataset`, `llm_test_case`). One `llm_test_case` GET instead returned HTTP 500 `{"errorCode":5002,"message":"<type> with id <id> not found"}` — also means deleted. Treat either as gone. |

Record exact selectors, bodies and the date verified. Replace TBD; do not append duplicates.

## AUTH MECHANISM (verified 2026-11-24, Pre-prod finance)

The credential the skill calls a "session cookie" is really TWO different things; a run needs both:

1. **API token** — value like `2_<uuid>_00`. Authenticates `/api/*` ONLY as the request header `x-ua-at: <token>`. As a `Cookie:` (any name) it returns 401. Use `scripts/ua_api_hdr.sh <base> <token-file> <METHOD> <path> [body]` (header variant of `ua_api.sh`). Verify with `POST /api/entity/dataset {"page":{"limit":1,"offset":0}}` → 200.
2. **Browser session cookie** — a separate HttpOnly cookie (name/value NOT the `x-ua-at` value). Required for every HTML/SPA route (`/p/0/...`). Without it, and even with `x-ua-at` injected as an extra header on all browser requests, the page redirects server-side to `/login` and fires zero API calls. `ua_probe.mjs` cannot authenticate the UI without this cookie. Collect it from DevTools → Network → any request → full `Cookie:` request header.

So with the API token alone: entity CRUD works; nothing UI-driven works.

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
