# Sentinel: configuration (Finance pre-prod)

Everything the build needs to know about the tenant, in one place. Secrets never go here.

## Tenant

| Item | Value |
|---|---|
| Platform | Finance pre-prod, `https://finance.toc.tekioncloud.xyz` (customer id 2, environment `tst`) |
| Build access | Tenant MCP servers at `https://finance.toc.tekioncloud.xyz/llm-tools/mcp/<server>` (`object`, `automation-code`, `agent-builder`, `connection`, `solution`). Authenticated by the `_at` session cookie; every call needs `Origin: https://finance.toc.tekioncloud.xyz` and a `host` argument. Client: `tools/ua_mcp.py` (reads the cookie from `UA_AT`). |
| UnifyApps Headless plugin | Installed at `~/.unifyapps-solutions/plugin/3.76.3`; its cookie file is `~/.unifyapps-solutions/session/cookies/finance.toc.tekioncloud.xyz`. Loads as a Claude plugin only after a restart; the MCP endpoints above are the same ones it uses. |
| Asset tag | `alert-monitoring` on every object, automation, agent and connection built for Sentinel |
| Names | System: Sentinel. Agent: Sentry. Channel: `#sentinel-finance` (to confirm). |

## Connections

| Connection | Id | Use |
|---|---|---|
| Slack `Sentinel \| Jay` | `6b07126be1098f3f51e57be4` | Flow F posting, reactions; Flow B replies |
| Post-message webhook | `https://webhooks.toc.tekioncloud.xyz/api/slack/workflow/connections/data/6b071297e61cdd44b6f2b494/2` | Slack workflow → platform |
| Button-feedback webhook | `https://webhooks.toc.tekioncloud.xyz/api/slack/button/connections/data/2/6b07126be1098f3f51e57be4` | Button clicks → platform (Flow B) |
| Atlas | on hold | Flow B link/create tasks, Flow C status |

## Slack groups

| Group | Id |
|---|---|
| Product team (FDSE + manager) | `S0B23CF34HK` |
| DevOps | `S07S9ULDYE6` |

## Platform operations the flows use

| Need | Connector / operation |
|---|---|
| Real-time failed run (Notifier trigger) | `appEvent("platform_by_unifyapps", "platform_by_unifyapps_on_automation_run_failed")`. Payload: automationId, executionId, rootExecutionId, parentExecutionId, isTestRun, nodeId, error[], startTime, endTime, userId, projectId, retryCount, inputs, version. Filter with `triggerInputCondition`. |
| Failed / in-progress run lists (Flow D, Flow E) | `analytics_by_unifyapps` / `analytics_by_unifyapps_query_reports`, entityType `WORKFLOW_EXECUTION`, filter `STATUS`, `timeFilter {since, until}` (see `reference/existing-node-failure-alert-finance.ts`) |
| Automation names and owners (registry seed) | `standard_entities` / `standard_entities_fetch_entities`, entityType `WorkflowDefinition`, projections name, id, oUId |
| Automation details | `standard_entities` / `standard_entities_get_automation_details` |
| Object records | `storage_by_unifyapps` / `storage_by_unifyapps_create_record`, `_fetch_records`, `_update_record_fields_by_id`, `_upsert_record`, `_bulk_upsert_records_by_id`, `_count_records`, `_aggregate_records`; triggers `_on_create_record`, `_on_update_record` (an option for driving the grouper from new FailedRun rows instead of a schedule) |
| Slack | `slack` / `slack_post_message_in_channel`, `slack_post_message_custom_block_kit` (buttons), `slack_reactions_add` / `_remove`, `slack_list_conversations_replies`, trigger `slack_on_new_message` (Flow B) |
| Code | `code_by_unifyapps` / `code_by_unifyapps_groovy` (also JavaScript / Python; check `get_code_sandbox_restrictions`) |

## Existing assets to leave alone

| Asset | Id | Note |
|---|---|---|
| Node Failure Alert - Finance | `6ab21aea970f873408436c68` | Current 5-min poller; keep running during shadow period |
| Node In Progress Alert - Finance | `6ab21b0b970f873408436c6b` | Current in-progress poller |
| Node In Progress Alert [More Than an Hour] - Finance | `6ab21bc3bd4d576514ffc7bf` | |
| Objects `infra_alerts`, `ua_alert`, `e_alert_*` | | Existing; Sentinel objects use their own names |

## Self-exclusion list (G4)

Every Sentinel automation id goes into the Notifier's `triggerInputCondition` so its own failures never loop. Filled in as automations are created.

| Automation | Id |
|---|---|
| sentinel · notifier | `6b071c56e61cdd44b6f3050f` (deployed v5) |
| sentinel · grouper | `6b0732e577940a61944d6d96` (deployed v1, every 2 min) |
| sentinel · poster | `6b07c3cfe61cdd44b6fba9ee` (deployed v1, every 2 min, only Slack writer) |
| sentinel · button-handler | `6b07c40fe61cdd44b6fbaf40` (Slack button clicks → tool-record-answer) |
| sentinel · reply-handler | `6b07c43ee61cdd44b6fbafe2` (Slack thread replies → Sentry agent) |
| sentinel · tool-get-issue | `6b07c3d177940a619451d510` (Sentry tool) |
| sentinel · tool-record-answer | `6b07c39977940a619451d4da` (Sentry tool; also used by the button handler) |
| sentinel · ask-sentry | `6b07c49ae61cdd44b6fbb103` (helper: invoke Sentry with context) |
| sentinel · stuck-runs | |
| sentinel · safety-checks | |
| sentinel · follow-up | |
| sentinel · registry-sync | `6b0732b877940a61944d6d70` (deployed v2, callable; seeds the registry in 10 pages of 500; 4805 rows) |
| sentinel · test-failure (test helper, must NOT be excluded) | `6b071bd0e61cdd44b6f30077` (deployed v0) |

## State: ALL AUTOMATIONS PAUSED (26 Nov, on request, to limit platform load)

Pause/resume: `POST https://finance.toc.tekioncloud.xyz/api/workflow-definition/{id}/pause` (toggle; needs the session cookie and `Origin` header), or the Running switch on the automation page. Resume order when restarting: notifier → grouper → poster → handlers; registry-sync, test-failure and the tools are callable and only run when called.

## Built so far

| Asset | Id | Notes |
|---|---|---|
| Object `sentinel_failed_run` (Sentinel Failed Run) | `sentinel_failed_run` | 22 fields, unique index on executionId, indexes on state, fingerprint, rootExecutionId. Definition: `objects/sentinel_failed_run.json` |
| `sentinel · notifier` | `6b071c56e61cdd44b6f3050f` | Trigger → Groovy parse → create record. Code: `automations/sentinel-notifier.ts`. Verified: failure to record in about 100 ms. |
| `sentinel · test-failure` | `6b071bd0e61cdd44b6f30077` | Callable; one Groovy node throws `SENTINEL_TEST_FAILURE: <reason>`. Fire with `trigger_workflow_run` runType `workflow`. |

## Objects built in step 2

| Object | Id | Notes |
|---|---|---|
| Sentinel Issue | `sentinel_issue` | unique fingerprint; state, severity, counters, needsPost/postKind for the poster |
| Sentinel Config | `sentinel_config` | key/value; 14 seeded keys incl. thresholds, channel id, group ids, shadowMode=true |
| Sentinel Workflow Registry | `sentinel_workflow_registry` | seeded 2000 rows from WorkflowDefinition (page cap; more pages needed), auto rows for unknown automations |
| Sentinel Incident | `sentinel_incident` | storm/infra/dependency; not yet written by the grouper (flags computed only) |

## Known-noise automations excluded at the notifier trigger

Same four ids the existing Node Failure Alert poller excludes. Observed in the first 90 minutes: 11,801 failed runs stored, most from a handful of automations.

| Automation | Id | Runs in 90 min |
|---|---|---|
| Throw Exception \| Agent (fails by design) | `68b827559a4a9d0149caa07d` | 1621 |
| Call automation batch with signal | `68c82cf26d4de43586f67a81` | 863 |
| (no registry row) | `66af3ff4cd79b321cb478a37` | 758 |
| (zero runs seen) | `6857dea0c42da15675ef3827` | 0 |

Not excluded, and real: Generic Fetch Embeddings `6784b9216fb83f0972c5625d` (3032), Call Custom HTTP Application Embeddings `6a4e5f02a761fa39710318e4`, Knowledge Indexer With RBAC (InMemory) `69c413209c79a662475933c9` (758), Knowledge Indexer With RBAC `66af3ff4cd79b321cb478a37` all fail on `405 Method Not Allowed` from the embeddings HTTP endpoint (model `bedrock/toc_cohere_v4`, connection `6a704024843c6518a309222a`). One dependency failure cascading through the knowledge pipeline: the first real B2 finding.

## Step 3: Slack and the Sentry agent

| Asset | Id | Notes |
|---|---|---|
| Sentry (AI agent) | `e_6b07c410f61bef41ade9150b` | model Sonnet 4.6 (Messages API) `e_6ac4a321a885f2077455eb41`; tools get_issue, record_answer; instructions in `agent/sentry-instructions.md`; `useAgentCore` false (the tenant has no agent-core; the test API fails, invoking through an automation works) |
| Objects | `sentinel_slack_post`, `sentinel_known_issue`, `sentinel_decision_log` | thread ts → Issue; learned knowledge; who decided what |
| Slack bot user | `U0CLTELV78D` (bot `B0CMT4R5TS4`, app user `p2p_helpdesk2`) | the reply handler ignores its own messages |
| Channel | `C0CKNN7U4M9` (#sentinel-finance) | `shadowMode` = false since 26 Nov |

Flow: grouper flags Issue `needsPost` → poster posts one thread per Issue with answer buttons (Expected · Known · Being worked on · Needs devs · Fixed · Not sure), repeats as thread replies, escalations and reopens as new top-level posts → a button click runs tool-record-answer directly; a thread reply goes to Sentry, which calls get_issue / record_answer and answers in the thread.

## Payload shape as observed (differs from the docs)

`error[]` holds one entry per failing node, each `{id: <nodeId>, type: "inputs" | "outputs", output: {...}}`. The `inputs` entry carries the node's inputs; the `outputs` entry carries the error: `message`, `rootCauseMessage`, `errorCode` (-1 for thrown exceptions), `errorId` (per occurrence, never in the fingerprint). HTTP nodes are expected to carry `output.body.error.{message, code, status}` (from the Main screenshot; not yet seen on Finance). The parser handles both. Top-level keys seen: automationId, executionId, nodeId, error, inputs, isTestRun, retryCount, startTime, endTime, version. `userId`, `projectId`, `rootExecutionId`, `parentExecutionId` were absent on an API-triggered callable run; treat them as optional.

## Build notes (DSL gotchas)

- The compiler type-checks pills strictly: trigger fields typed `long` are not assignable to `integer`, `number` or `string` inputs. Pass the whole trigger payload as one `object` parameter (`event: t`) and convert inside the code node.
- Use Groovy, not JavaScript, for payload parsing: in GraalJS the platform's Map payloads read as empty objects.
- `code_by_unifyapps_groovy` takes `input`, `output`, `parameters`, `code`, `compile_static`, `captureStdOutput` only (no `isAsync`).
- HTTP node failures arrive as `output: {status_code, status, body}` with the message in `body`; thrown errors as `output: {message, rootCauseMessage, errorCode, errorId}`; a parent wraps a child's error as a stringified Groovy map in `message`.
- `get_records` takes `sort` as an object, not a list, `limit` at most 200; `apply_record_edits` filter edits need a dryRun first (`wouldApply[0].matched`), then `expectedCount`; deletes stop at 500 rows per call.
- An undefined pill inside a filter fails the fetch at run time; default optional lookup keys to a sentinel such as `__none__` first.
- `ai_agents_by_unifyapps_invoke_agent` returns `agentResponses[]` including status lines ("Executing the tool ..."); take the last non-status text.
- The Groovy sandbox blacklists the token `owner =`; name variables `ownerTxt`, `ownerId`.
- `.length` on a node output is not a pill; use `count_records`. `update_records` with `isIn("id", <list pill>)` is the reliable way to mark a set of rows; `bulk_update_record_by_id` with `.map()` failed silently. `trigger_workflow_run` takes no `host`.
- Set `settings.enableVariableLogging: true` or `inspect_workflow_run` returns no node inputs/outputs.

## Open

- Channel id for `#sentinel-finance` (create the channel, invite the Sentinel bot).
- Atlas MCP actions (read + create + update) and the TEK field that says a fix is deployed.
- Whether `nodeId` is stable across redeploys (decides whether it stays in the fingerprint).
- Config thresholds: storm count, escalation count, reminder SLA, ETA chase interval, Atlas stale days, silence close days, error size cap.
