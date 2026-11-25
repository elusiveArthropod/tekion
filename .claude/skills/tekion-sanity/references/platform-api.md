# UnifyApps platform: verified API calls and discovered UI details

All calls are same-origin with the user's session cookie. `scripts/ua_api.sh <base> <cookie-file> <METHOD> <path> [json-body]`. Exit 2 means the cookie is dead.

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

## To discover on the first run (record here once found)

| Item | Status |
|---|---|
| Solution Builder: prompt input selector and send action | TBD |
| Solution Builder: how to list and delete a solution (UI path or entity type) | TBD |
| `GetAllSessions` request body for the AI Teams sessions page | TBD |
| FDE agent: chat/test surface URL and reply container selector | **Found 2026-11-25.** "Preview" top-bar button (CSS `text=Preview`, no href) navigates to `/p/0/ai-agents/<agentId>/test?...chatId=new` (title "Test Agent Copilot"); openable directly via that `/test` URL. Chat input: contenteditable `.tiptap.ProseMirror` with placeholder "Ask a question" — robust selector `div[contenteditable='true'][role='textbox']` (aria-label "Ask a question"); playwright `fill` works, send with `press` Enter. A transient AUTH_EXPIRED (probe exit 2) can appear during the Preview-click SPA navigation as a false positive; confirm by loading `/test` directly. Reply container (verified 2026-11-25 FDE-QA): no stable per-message class (markdown/prose/message selectors return 0); the answer streams into `document.body.innerText` — agent first shows a tool line (e.g. "Let's make use of the tool Ask From Knowledge", ~18-24s), then "Generating response…", then the answer ending with "Response has been generated". Capture via `body` innerText and slice after the echoed question; allow ~90s settle before capturing (waitForText on a short answer term fires too early, while the RAG tool call is still running). |
| FDE agent: conversation starter chip selector | **Found 2026-11-25.** Starters are configured on the Instructions page under heading "Conversation starters" as numbered input rows (placeholder "Start typing…"); when unset it shows a single empty "1" slot. The chat surface renders starter chips only when starters are configured. On `e_ai_fde_agent` none were configured, so the rendered chip selector could not be captured. |
| Experiment entity type, create body and "run" call | **Found 2026-11-25.** Entity type `experiment`. Detail/runs UI: `/p/0/evaluation/experiments/<id>/runs`. Create: `POST /api/entity` body `{"entityType":"experiment","properties":{"name":"<stamp>","dataset_ids":["<dsId>"],"agentId":"<agentId>","task":{"aiAgentId":"<agentId>","version":"-1","task":"agent"},"skipApprovalBeforeToolExecution":true,"metrics":[{"metricId":"<metricId>"}],"concurrency":10}}` → 200 with new `experiment` id. Run trigger: the "Start Run" button fires `GET /api/workflow/execute/node?name=call_automation` (UI node call; not re-run from the API in this check). Poll runs via `POST /api/entity/experiment_runs {"filter":{"field":"properties.experimentId","op":"EQUAL","values":["<expId>"]}}` → each run has `status` (`running`/`completed`), `successCount`, `failureCount`, `totalTestCases`, `runId`. Per-case: `POST /api/entity/test_case_runs {"filter":{"field":"properties.experimentId","op":"EQUAL",...}}` (experimentId filter is REQUIRED; runId-only 500s) → objects with `metadataFields.testCaseId`, `actualOutput`, `metricScores[]` (`metricId`,`score`,`result`,`reason`). |
| Whether a `/api/entity/<type>/<id>` GET on a deleted entity returns 404 or an empty body | **Found 2026-11-25.** After `POST /api/entity/<type>/delete/<id>` (returns `true`), a GET usually returns HTTP 404 `{"message":"Entity not found"}` (seen for `experiment`, `dataset`, `llm_test_case`). One `llm_test_case` GET instead returned HTTP 500 `{"errorCode":5002,"message":"<type> with id <id> not found"}` — also means deleted. Treat either as gone. |

Record exact selectors, bodies and the date verified. Replace TBD; do not append duplicates.
