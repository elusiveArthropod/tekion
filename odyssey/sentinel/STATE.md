# ODYSSEY: Sentinel (alert monitoring agent for the Finance pre-prod platform)

Phase: 4 Build (steps 1–3 done, paused)  ·  Started: 21 Nov 2026  ·  Last update: 26 Nov 2026

## Problem
Platform (pre-prod) failed-run alerts are posted to Slack every 5 minutes by an automation, plus a dashboard app; but someone still has to watch them. Nobody replies to the alerts. A missed failure has turned into client escalations. We want an agent that watches on its own: sees a failed run, understands it, checks whether it is expected or already reported, asks the product team when it is not, and follows up until it is handled.

## Goal and success criteria
- Goal: no distinct failure on the Finance pre-prod platform goes without a human decision, and known/expected failures stay silent.
- Success looks like: every new failure fingerprint gets a Slack thread with context and buttons within minutes; every thread gets an answer or an escalation; suppressed noise never pings anyone; the team trusts the channel enough to retire the old 5-minute feed.
- Out of scope (v1): Main pre-prod platform, prod, recovery detection from success runs, Atlas write-back.

## Constraints, dependencies, assumptions
- Finance tenant only (finance.toc.tekioncloud.xyz). Build access via the tenant MCP servers with a session cookie (Jay's); a Sentinel service user is still needed.
- The tenant has no agent-core: the agent runs through automations, not the test API.
- Platform failure volume is high (11.8k failed runs in 90 min on 25 Nov), dominated by a few automations.
- All assets tagged `alert-monitoring`; no platform project.

## Decisions (numbered; never delete, supersede)
See the "Decisions & Open Qs" tab of the sheet (Alert_Agent_Case_Tracker, 40 rows). Headline decisions:
| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 25 Nov | Finance pre-prod only first (changed from Main + Finance) | one platform, simpler fingerprint and objects |
| 5 | 23 Nov | On first unique error, ask product in the thread with error details; answers become records | knowledge is built by humans, only when needed |
| 6 | 23 Nov | Two counters: totalCount (never resets) and countSinceLastAck (resets on answer); escalate at threshold | one counter either re-escalates right after an answer or never again |
| 8 | 23 Nov | Deterministic ingestion/grouping in code; LLM only for interpretation and replies | the LLM can be down without losing events |
| 23 | 25 Nov | Names: Sentinel (system), Sentry (agent), #sentinel-finance | |
| 29 | 25 Nov | Trigger payload shape as observed (per-node error entries), parser handles thrown, HTTP and wrapped errors | |
| 35 | 25 Nov | Exclude the 4 known-noise automations at the notifier trigger (same as the old poller) | thousands of runs/hour, by design |
| 37 | 25 Nov | Escalation: tag product on first failure; count unanswered failures to 5; escalate and tag again | user's rule |
| 39 | 26 Nov | Sentry runs via invoke_agent in automations (useAgentCore false) | tenant has no agent-core |

## Open questions
| # | Question | Owner | Blocks | Status |
|---|---|---|---|---|
| 10 | How to know a fix PR is deployed on Finance (Atlas field? release record?) | user | A6, F3 | open |
| 11 | Atlas MCP actions: read + create + update? | user | A5, E1, F1 | on hold |
| 36 | Who owns the embeddings HTTP connection returning 405 (Generic Fetch Embeddings, Knowledge Indexer)? | user | the loudest real Issue | open |
| 40 | Slack app URLs: Interactivity and Event Subscriptions must point at connection `6b07126be…` webhooks; no click or reply has reached the platform | user / Jay | buttons, thread replies | open |
| 41 | Resume: everything, or notifier + grouper only? | user | restart | open |

## Proposed, not yet decided
- Retention job for grouped runs (object grows ~50k rows/day at current failure rate).
- Recount Issue totals from grouped rows (first grouper test double-counted 200 runs).
- Exclude "Generic Fetch Embeddings" at the trigger, or keep it as a real Issue (decision 36 pending).

## Case catalog
Sheet "Cases" tab: 42 cases in 7 types; A1, F2, F5 dropped (need success data), B5 dropped (single platform). Each row names the scheduler/component that handles it.

## Solution design
- Flow (simple): `sentinel/reference/sentinel-flow-simple.drawio` (five questions: real or noise → new or known → who owns it → how bad → action; Flow B human answers; Flow C follow-up)
- Flow (detailed): `sentinel/reference/sentinel-flow-detailed.drawio` (system overview, pipeline, Issue states, sweeper, data model)
- Hand-off between automations with goals: `sentinel/CONFIG.md`
- Components: notifier → grouper → poster → button-handler / reply-handler → Sentry → tool-record-answer; helpers registry-sync, ask-sentry, test-failure.
- Data model: sentinel_failed_run, sentinel_issue, sentinel_config, sentinel_workflow_registry, sentinel_incident, sentinel_slack_post, sentinel_known_issue, sentinel_decision_log.
- Integrations: platform trigger On Automation Run Failed; Slack connection `Sentinel | Jay` 6b07126be1098f3f51e57be4; channel C0CKNN7U4M9; Atlas on hold.
- Build order: 1 notifier + FailedRun → 2 grouper + Issue/Config/Registry/Incident → 3 poster + agent + handlers → 4 follow-up sweeper → 5 safety checks + stuck runs → 6 incidents, Atlas, retention.

## Build log
| Step | Built | Verified how | Ids | Date |
|---|---|---|---|---|
| 1 | FailedRun object, notifier, test-failure | test failure → record in ~100 ms; parser fixed for 3 payload shapes | 6b071c56…, 6b071bd0… | 25 Nov |
| 2 | Issue/Config/Registry/Incident objects, grouper, registry-sync | 400 runs grouped into Issues; registry 4805 rows; backlog of excluded noise deleted (3242 rows) | 6b0732e5…, 6b0732b8… | 25 Nov |
| 3 | SlackPost/KnownIssue/DecisionLog objects, poster, Sentry agent + 2 tools, reply-handler, button-handler, ask-sentry | 27 threads posted; agent question answered from data; agent decision → Issue suppressed + Known Issue + Decision Log | 6b07c3cf…, e_6b07c410…, 6b07c43e…, 6b07c40f… | 26 Nov |
| 3b | Audit of our own failures | notifier v6 ignores platform-internal runs; poster v1, tool-get-issue v1 fixes; Issues from our bugs resolved | | 26 Nov |

## Platform gotchas learned
See `.claude/skills/odyssey/references/lessons.md` (UnifyApps section) and `sentinel/CONFIG.md` (Build notes).

## Known gaps and deferred items
- Flow C follow-up, Flow D safety checks, Flow E stuck runs: not built.
- Storm detection computes flags but writes no Incident and posts nothing.
- Cascade grouping only within one 2-minute batch.
- No retention; no recount of early double-counted totals.
- Sentinel runs on a person's session cookie, not a service identity.

## Assets
Sheet "Assets" tab (every automation, object, agent, connection, channel, webhook, with ids and state). All 10 automations PAUSED since 26 Nov on request.

## Resume notes
- Where to pick up: fix Slack app URLs (open 40) → resume notifier + grouper → resume poster → verify a button click and a thread reply end to end → build Flow C.
- What is paused / live: all automations paused; objects, agent (published v3), Slack threads remain.
- First thing to check: `search_workflows tag alert-monitoring` deployment statuses; run history of each for failures; `needsPost` count before resuming the poster (it will post everything pending at once).
