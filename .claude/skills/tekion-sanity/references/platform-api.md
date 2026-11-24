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
