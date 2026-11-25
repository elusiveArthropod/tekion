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
| sentinel · notifier | |
| sentinel · grouper | |
| sentinel · poster | |
| sentinel · stuck-runs | |
| sentinel · safety-checks | |
| sentinel · follow-up | |

## Open

- Channel id for `#sentinel-finance` (create the channel, invite the Sentinel bot).
- Atlas MCP actions (read + create + update) and the TEK field that says a fix is deployed.
- Whether `nodeId` is stable across redeploys (decides whether it stays in the fingerprint).
- Config thresholds: storm count, escalation count, reminder SLA, ETA chase interval, Atlas stale days, silence close days, error size cap.
