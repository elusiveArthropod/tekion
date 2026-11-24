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
| FDE agent: chat/test surface URL and reply container selector | TBD |
| FDE agent: conversation starter chip selector | TBD |
| Experiment entity type, create body and "run" call | TBD |
| Whether a `/api/entity/<type>/<id>` GET on a deleted entity returns 404 or an empty body | TBD |

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
