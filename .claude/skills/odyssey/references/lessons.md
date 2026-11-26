# Lessons from the Sentinel odyssey (Nov 2026)

What the first run of this loop taught, kept so the next one starts further ahead. Project files: `sentinel/` in this repo, sheet "Alert_Agent_Case_Tracker".

## Process lessons

- **Read the real data before the first question.** The alert channel showed zero human replies, no error text in alerts, failures in clusters, and an environment mismatch in the channel name. The brief said none of it.
- **The unit of work is rarely the obvious one.** Alerts were the obvious unit; Issues (one per fingerprint) were the right one. Most of the value came from grouping, dedup and memory, not from the LLM.
- **A case catalog with a status column is the best discussion surface.** 42 cases, each with type, detection, action, Slack behaviour, objects touched, phase, status. The team could review it without the chat. "Dropped" is a valid outcome; record why.
- **Two diagrams, not one.** The detailed one (components, reads/writes, state machine, data model) is for building. The simple one (five questions, band per question, purple tags for what gets written) is for explaining. Render and inspect before sending; the first renders always have lines through boxes.
- **Numbered decisions stop re-litigation.** When the user changed scope (two platforms → one), it was "decision 1 changes, here is what that removes", not a new debate.
- **Ask for access and connections before the build step that needs them**, as a table: what to create, why, how to hand it over. Session cookies are for discovery only; say so every time one is pasted, and ask for rotation.
- **One slice, verify, commit, next.** Trigger → record in 100 ms was slice 1. It found the payload shape differed from both documented shapes, which would have broken everything built on top.
- **Audit your own components' run history before calling a step done.** Five notifier failures came from our own agent tests; the user's first question after the build was "how can we monitor the platform if our own automations fail".
- **Watch volume from minute one.** 11,801 failed runs in 90 minutes; four known-noise automations; a 405 from one embeddings endpoint cascading through a whole pipeline. The first real finding came from counting rows, not from the agent.
- **Have a pause plan.** The user asked to stop everything for load reasons; knowing the pause API in advance would have saved a browser probe.
- **The LLM goes where interpretation is needed and nowhere else.** Fingerprinting, dedup, counters, escalation ladder: code. Reading an error and turning "it's our test automation" into a recorded decision: agent. Buttons give exact answers without the LLM at all.

## UnifyApps platform gotchas (Finance tenant, Nov 2026)

Build access
- Tenant MCP servers at `https://<tenant>/llm-tools/mcp/{object,automation-code,agent-builder,connection,solution}`; every call needs the `_at` cookie, `Origin: https://<tenant>` and a `host` argument (except `trigger_workflow_run`, which refuses `host`). Client: `sentinel/tools/ua_mcp.py`.
- The UnifyApps Headless plugin ("Nebula") installs with a 10-minute token; it is a Claude plugin that needs a restart, but its MCP endpoints can be called directly.
- Pause/resume an automation: `POST /api/workflow-definition/{id}/pause` (toggle). `deploy_workflow` un-pauses; re-pause after deploying a fix.

Automation DSL (`compile_and_save_workflow`)
- Strict pill typing: trigger fields typed `long` are not assignable to integer/number/string inputs. Pass the whole payload as one `object` parameter (`event: t`) and convert inside a Groovy node.
- Use Groovy, not JavaScript, for payload parsing; in GraalJS the platform's Map payloads read as empty objects.
- `code_by_unifyapps_groovy` takes only `input`, `output`, `parameters`, `code`, `compile_static`, `captureStdOutput`. No `isAsync`. `Date.format` is blocked; use `java.time`. The sandbox blacklists the token `owner =`; name variables `ownerTxt`.
- An undefined pill inside a storage filter fails the fetch at run time; default optional keys to a sentinel like `__none__` first.
- `.length` on a node output is not a pill; use `count_records`. Mark a set of rows with `update_records` + `isIn("id", <list pill>)`; `bulk_update_record_by_id` with `.map()` failed silently.
- Enums are enforced on create: a value outside the object's enum fails the insert (the SlackPost `kind: "new"` bug).
- `settings.enableVariableLogging: true` or `inspect_workflow_run` shows no node inputs/outputs; test-lane (`workflow_test`) runs never expose node I/O, so inspect deployed runs.
- `get_records`: `sort` is an object, `limit` ≤ 200. `apply_record_edits` filter edits need a dryRun (`wouldApply[0].matched`) then `expectedCount`; deletes stop at 500 rows per call.
- `search_operations` lists 25 by default and ignores `query`; pass `limit: 500`.

Triggers and events
- `platform_by_unifyapps_on_automation_run_failed` fires per failed run. Observed payload: `error[]` has one entry per failing node, `{id, type: inputs|outputs, output}`; thrown errors give `output.{message, rootCauseMessage, errorCode, errorId}`; HTTP nodes give `output.{status_code, status, body}`; a parent wraps a child's error as a stringified Groovy map. Platform-internal runs (agent tests) carry no `automationId`. `userId`, `projectId`, `rootExecutionId` are often absent.
- Exclude the notifier's own id in `triggerInputCondition` or it loops on its own failures.
- Slack triggers: `slack_on_new_message`, `slack_on_button_click`, bound with `{ connectionId }`. Events arrive only if the Slack app's Event Subscriptions and Interactivity request URLs point at that connection's webhook URLs; a Slack app has one of each.

Agents
- `create_agent` needs a model id from `list_models`. Tools are callable automations bound with `add_tools`; the automation's `setup` schema is the tool's arguments.
- If the tenant has no agent-core, `send_test_message` fails with `AgentCoreDisabledException` whatever `useAgentCore` is; invoke through `ai_agents_by_unifyapps_invoke_agent` in an automation instead. `agentResponses[]` includes "Executing the tool …" status lines; take the last non-status text.
- Write Slack mrkdwn rules into the agent instructions or it answers in markdown.
