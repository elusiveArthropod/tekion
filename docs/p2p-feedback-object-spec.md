# P2P Text2SQL agent: one feedback object (spec)

Agent: `TextToSQL | P2P Helpdesk Assistant` (`e_6acf3cb18f9af45120964849`), env `finance.toc.tekioncloud.xyz`.
Status: proposal only. Nothing was changed in the environment. Data below was read on 2026-11-14.

## Why move

The Slack feedback flow (deployment `6ad0b3f38b7fba778f8b7556` nodes 30-32, Main Feedback 1-4) writes to two objects:

| Object | Records | Also written by | Problem |
|---|---|---|---|
| `slack_feedback_collector` | 355 total: 212 this agent, 103 `AP P2P Helpdesk Assistant` (`e_69443639f65f3d1249f6f1fa`), 40 with no agent | the old P2P agent and the standard "Slack Publisher (AI Agent)" automation | shared, untagged, `feedback` is a number, no query text, no user |
| `p2p_feedback_collector` | 44 total: 34 this agent, 10 old agent | the old P2P agent | holds two unrelated record shapes, never linked to the Yes/No value |

What the current records show (this agent, 2026-11-04 to 2026-11-13):

- 212 answers got feedback buttons; 59 were clicked (30 Yes, 29 No): 28% response.
- `caseId` filled on only 74 of 212, because node 31 reads `n_o0Nd5.outputs.threadCaseId`, which is empty on a thread's first message.
- `slackUserId` is never filled, in either object.
- `slack_feedback_collector.content` now holds the user message **ts**, not text. The question text is only in `p2p_feedback_collector`, keyed by thread root, so in a multi-turn thread (up to 5 answers per thread seen) a 👎 cannot be tied to its question.
- 28 "Continue / Raise" button records exist, but whether the user continued or escalated is not stored anywhere.

Do not delete or change the two old objects: the old agent and the standard Slack Publisher still write to them.

## New object

Suggested id `p2p_agent_feedback`, tag `p2p_2`. **One record per agent answer**, created by deployment node 31 and updated in place by MF1-MF4 (MF2 must update, not create).

### Keys and links

| Field | Type | Written by | Value | Notes |
|---|---|---|---|---|
| `agentId` | string | deployment n31 | `e_6acf3cb18f9af45120964849` | existing |
| `caseId` | string | deployment n31 | `{{ _BQoJf.outputs.caseId }}` | **source change**: use the Case Management output (same as node 29), not `threadCaseId`. Needed to join to the conversation and the agent's answer |
| `caseMessageId` | string | deployment n31 | `{{ _BQoJf.outputs.messageId }}` | new. The platform message id of the question; links to the run/transcript |
| `channelId` | string | deployment n31 | `{{ h77A8.outputs.event.channel }}` | new for the Yes/No record |
| `threadTs` | string | deployment n31 | IF(thread_ts blank, ts, thread_ts) | today's `messageId`; rename for clarity |
| `userMessageTs` | string | deployment n31 | `{{ h77A8.outputs.event.ts }}` | today's `content`; MF1 adds ✅ to it |
| `feedbackMessageTs` | string, unique | deployment n31 | `{{ n_64VlQ.outputs.message.ts }}` | lookup key for MF1. today's `messageTimestamp` |
| `escalationMessageTs` | string | MF2 (update) | `{{ n_64VlQ.outputs.message.ts }}` in MF2 | lookup key for MF3. today's `feedbackMessageTimestamp` |
| `threadLink` | string (URL) | deployment n31 | `https://<workspace>.slack.com/archives/<channelId>/p<threadTs without dot>` | for the digest/dashboard; or call chat.getPermalink |

### Who

| Field | Type | Written by | Value |
|---|---|---|---|
| `askerSlackUserId` | string | deployment n31 | `{{ h77A8.outputs.event.user }}` |
| `askerEmail` | string | deployment n31 | `{{ 0vkKV.outputs.emailAddress }}` ([Slack] Get User, node 28) |
| `askerName` | string | deployment n31 | name from node 28 output |
| `feedbackBySlackUserId` | string | MF1 | clicker's user id from the button event |
| `nextActionBySlackUserId` | string | MF3 | clicker's user id from the button event |

`askerSlackUserId` vs `feedbackBySlackUserId` also shows when someone other than the asker clicked.

### Content

| Field | Type | Written by | Value | Notes |
|---|---|---|---|---|
| `userQuery` | long text | deployment n31 | `{{ h77A8.outputs.event.text }}` | strip the leading bot mention (`<@U0C9G8E1CF4> `) |
| `agentResponse` | long text | (later) | — | not available in this flow: "Trigger AI Agent (Async)" returns only `success`. The dashboard can join on `caseId`/`caseMessageId` instead; add this field only if you want it denormalised |

### Status

| Field | Type | Written by | Values |
|---|---|---|---|
| `feedback` | enum | n31 = `PENDING`; MF1 sets | `PENDING`, `HELPFUL`, `NOT_HELPFUL` (replaces 1 / 0 / null) |
| `feedbackAt` | datetime | MF1 | click time |
| `nextAction` | enum | n31 = `NONE`; MF3 sets | `NONE`, `CONTINUE`, `ESCALATED` |
| `nextActionAt` | datetime | MF3 | click time |
| `source` | string | n31 | e.g. `slack:P2P_2` (lets Copilot feedback share the object later) |

### Optional, only if Finance closure is tracked

Nothing writes these today; add them only if the dashboard must show open vs closed escalations.

| Field | Type | Values |
|---|---|---|
| `escalationStatus` | enum | `OPEN` (set by MF4), `RESOLVED` |
| `resolvedBy` | string | |
| `resolvedAt` | datetime | |
| `resolutionNote` | long text | |
| `feedbackComment` | long text | free text "why not helpful", if a Slack modal is added later |

Not needed: a "digest sent" flag. The daily digest can filter on `feedbackAt` / `nextActionAt` / created time.

## Flow changes this implies

1. Deployment n31 creates the record with the fields above; n32 (the second `p2p_feedback_collector` create) is removed.
2. MF1 finds the record by `feedbackMessageTs`, sets `feedback`, `feedbackAt` and `feedbackBySlackUserId`, and passes `feedbackMessageTs` (or the record id) to MF2.
3. MF2 **updates** that record with `escalationMessageTs` instead of creating a new one.
4. MF3 finds it by `escalationMessageTs` and sets `nextAction`, `nextActionAt` and `nextActionBySlackUserId`.
5. MF4 sets `escalationStatus = OPEN` (if the optional fields are used).

Do this together with the fixes from the flow review (branch on `action_id`, not button text; pin step must not stop on `already_pinned`; deploy MF2+MF3 together).

## What the daily digest / dashboard can then show

- Per day: answers, feedback given, helpful vs not helpful, response rate (`feedback != PENDING`).
- Not-helpful list: `userQuery`, `askerName`, `nextAction`, `threadLink`.
- Escalations: count, and age while `escalationStatus = OPEN`.
- The answer text: via `caseId` / `caseMessageId` join, not stored.

## Backfill (optional)

The 212 + 34 old records map partly: `content` → `userMessageTs`, `messageTimestamp` → `feedbackMessageTs`, `messageId` → `threadTs`, feedback 1/0/null → enum. `userQuery` and `nextAction` cannot be recovered reliably for multi-turn threads (the escalation records only carry the thread root).

## Applied on 2026-11-14 (object `p2p_feedback_collector`, schema v2 → v3)

Decision: use the existing custom object `p2p_feedback_collector` instead of a new one. Existing keys were kept (no rename, no type change) because 44+ records and the old agent `e_69443639f65f3d1249f6f1fa` still use them; only display names changed. 18 fields were added. Before/after definitions: `p2p_feedback_collector.schema.before.json`, `p2p_feedback_collector.schema.after.json`.

Spec name → actual key: `userQuery` → `content`, `askerSlackUserId` → `slackUserId`, `threadTs` → `headerThreadTs`, `feedbackMessageTs` → `feedbackMessageTimestamp`, `userMessageTs` → `userThreadMessageTimestamp`, `escalationMessageTs` → `escalationMessageTimestamp`. `feedback` (was a free string, never filled) is now single-select PENDING / HELPFUL / NOT_HELPFUL.

### Slack timestamp rule

| Field | Display name | Value |
|---|---|---|
| `feedbackMessageTimestamp` | Feedback Message Timestamp | ts of the "Was this helpful? Yes/No" message (deployment n30 output) |
| `headerThreadTs` | Header Message Timestamp | always set. First message: the user's message ts. Message in a thread: the thread's root ts. Expression: `=IF(ISBLANK({{ h77A8.outputs.event.thread_ts }}),{{ h77A8.outputs.event.ts }},{{ h77A8.outputs.event.thread_ts }})` |
| `userThreadMessageTimestamp` | Thread User Message Timestamp | only for a message in a thread: `{{ h77A8.outputs.event.ts }}` when `thread_ts` is not blank; empty for a first message |
| `escalationMessageTimestamp` | Escalation Message Timestamp | ts of the "Continue / Raise To Finance Team" message (MF2) |

The user's own message is therefore `userThreadMessageTimestamp` if set, else `headerThreadTs` (MF1 adds ✅ to that one).

### Legacy fields, still written by the live flow

- `feedbackMessageTimestamp`: MF2 currently writes the **escalation** button ts here and MF3 looks it up here. When the flow is rebuilt, MF2 must write `escalationMessageTimestamp` and MF3 must look up by it, so this field means the Yes/No message only.
- `threadTs` (Thread Ts (Legacy)) and `messageId` (Message ID (Legacy)): both hold the thread root today (MF2 / deployment n32). Replace with `headerThreadTs` in the rebuild; stop writing them after.

## Deployed 2026-11-14 (tag `feedback_v2`)

| Automation | Draft deployed | Live version (was) |
|---|---|---|
| P2P_2 \| AI Agent(Slack Deployment) `6ad0b3f38b7fba778f8b7556` | v36 | v20 (v19) |
| Main Feedback 1 `6aeb1c0cda2c243f0fa4d13c` | v20 | v5 (v4) |
| Main Feedback 2 `6aeb1e9a7b6dbf46afa0d2f3` | v10 | v4 (v3) |
| Main Feedback 3 `6aeb1c20da2c243f0fa4d1cc` | v13 | v2 (v1) |
| Main Feedback 4 `6aeb204c7b6dbf46afa0e44a` | v11 | v7 (v6) |

Object `p2p_feedback_collector` v5: time fields are `feedbackAtTs`, `nextActionAtTs`, `resolvedAtTs` (string, Slack ts). The integer `feedbackAt` / `nextActionAt` / `resolvedAt` are deprecated: the platform refuses type changes on an object that has records.

Before MF1/MF3 field re-point: `pre-deploy-<automationId>.json`. Roll back by redeploying the previous version from the automation's version history.

Open after deploy: MF4 pin step is STOP (a second escalation in one thread may not tag Finance); `escalationStatus` and `notHelpfull_resolved_with` are not written; `user.id` / `action_ts` paths to be confirmed by the first test.
