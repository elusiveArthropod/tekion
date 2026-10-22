---
name: tekion-board-sync
description: Reconcile the Tekion Tasks board in Atlas (TEK) with the #tekion-delivery Slack channel for a date window, so the board is accurate enough for CTO review. Use this whenever the user asks to update, sync, reconcile or clean up the Tekion board, Atlas board or TEK tickets from Slack, asks what is open or stale for Tekion, wants the daily open-items summary Rachit asked for, or names a date range of #tekion-delivery to go through. Also use it when the user says "next window", "go back 10 days" or "do the same for earlier" after a sync.
---

# Tekion board sync

Make the TEK board say what Slack says, one bucket at a time, with the user approving every write. The board is read by the CTO, so a wrong status or a guessed assignee is worse than a stale one. Accuracy comes from reading each Slack thread yourself and quoting it, never from summaries.

## Inputs

- Channel: `#tekion-delivery`, id `C0A1EPNSLJ1`.
- Board: team Tekion Tasks, prefix TEK, team id `2604063610`, project Tekion `8118998788`.
- Window: the date range the user names. Default to the last 10 days. Work windows back in time, one at a time.
- All ids (statuses, custom fields, option ids, people, Slack user ids) are in `references/ids.md`. Read it before any write.

## Process

### 1. Pull the raw data without reading it into context

Slack and Atlas responses for a window run to hundreds of KB. Pull them, let the tool save them to files, and condense with the scripts in `scripts/`. Only the condensed output goes into context.

1. `slack_read_channel` on the channel for the window (page with `oldest`/`latest`). Condense with `scripts/condense_slack.py <saved-file> > timeline.txt`: one line per message with timestamp, author, ts, reply count and the first 700 characters.
2. `fetch_issues` on scope `team`, sorted by `updated` desc, size 50, filtering `statusKey IN` every non-Done, non-Canceled status (the filter works even though the tool description says it does not). Page until `hasMore` is false. Condense with `scripts/condense_board.py <files...> > board.txt`, which also writes `board-ids.json` with id, version and assignees per key. You need the version for every write.
3. Slack threads cite keys that may already be Done. Search the board for those keys (`fetch_issues` with `search: "TEK-39"` style prefixes) so Done tickets are in view too.
4. `fetch_statuses` and `fetch_custom_fields` for the team only if `references/ids.md` looks stale.

### 2. Read every thread yourself

Spawning agents to summarise threads is fast but was wrong on two of three tickets in one batch: it missed explicit "resolved ✅" replies. For every thread that maps to a ticket or a candidate ticket, call `slack_read_thread` and read it in full before proposing anything. Long threads (90+ replies) are fine; pass `limit: 100`.

Quote the decisive messages verbatim, with author and date. A comment that says "RCA per Devang Vaghani: `provisionApp: false`" survives a CTO's scrutiny; "fixed by the team" does not.

### 3. Bucket before touching anything

Present every item in the window in these buckets, then work them in order. The user closes each bucket.

1. **Present but stale**: TEK ticket exists, open in both, but status, assignee, priority or project is behind Slack.
2. **Missing**: thread with no ticket on any board.
3. **Done per Slack, open in Atlas**.
4. **Done in Atlas, not done per Slack**: check `issue_history` to see who closed it before judging.
5. **Waiting on Tekion**: the next step is the client's.
6. **Tracked on another board** (AO, EB, AI, TTS, SEV): list for awareness only. Never write to other boards.
7. **Consistent**: Done in both, no action.
8. **Process items**: asks for summaries, incident lists, pipeline work, client escalations. Circle back at the end and ask whether they become Tasks.

### 4. Propose per ticket, then wait

For each ticket give: the thread facts with quotes, the proposed field changes, the comment text, and every question the thread leaves open. Do not write until the user says go for that ticket or bucket. A format note from the user is not a go. If the user interrupts, stop and ask what to change.

Ask rather than guess on: which of two same-named people (Devang vs Devang Vaghani), whether a fix announced in Slack actually landed, whether an item belongs on TEK at all, and priority when the thread does not say "critical" or "blocker".

### 5. Write, in this shape

Every change to an existing ticket is two calls:

- `update_issue` with `expectedVersion` from `board-ids.json`, sending only the changed fields. `assigneeIds` is an absolute set, so pass existing ids plus the new one. Add the Slack thread (and PRs, Jira, related threads) to `links`. A CONFLICT means someone edited it since you read it: re-read with `fetch_issue_details`, reconcile, retry.
- `create_comment` in the trail format below. Mention tagged people with `mentionedUserIds`.

New tickets use `create_issue` with: team, project, title in the board's `Area | Env | Symptom` style, markdown description that opens with who raised it, where and when, then the facts and the last known state; Type, Module, Environment, Customers = Tekion, Reporter = the Slack poster; status; priority; assignees; links; an `idempotencyKey`. Sub-issues do not inherit the project: set `projectId` on each afterwards.

Trail comment format:

```
**Board sync from #tekion-delivery, <date>**

<What happened, with author, date and quotes. Root cause if stated. What is still unconfirmed.>

<Field changes made, e.g. "Status Backlog → Dev Todo, assigned X.">

Slack: [<thread name>](<url>) · <other links>
```

### 6. Follow up in Slack when the thread is silent

When a ticket cannot be resolved from the thread, tag the thread owner on the ticket comment and reply in the Slack thread with the same question, citing the TEK key. Use `slack_send_message` with `thread_ts`. Keep it to one or two sentences and say what you will do with the answer.

## Rules the user set

- **Who can close**: a "resolved", "working", "closed" or ✅ from Jaimin Prajapati, Harsh Bansal, Jay Rathod, Meet Andharia, Shikha Choudhary or Vaibhav Dhand counts as tested. Move to Done. Anyone else's "resolved" gets a follow-up question to the thread owner instead.
- **Only the TEK board is written to.** EB, AO, AI, TTS tickets are referenced in links and comments, never edited. When an EB dev ticket exists for a Tekion issue, mirror it on TEK (parent plus sub-issues if several) so the CTO view is complete.
- **Assignees are developers.** Vinod Ramanathan, Harsh Bansal and Shikha Choudhary are not dev assignees for dev work. Vinod Ramanathan is the assignee for every Awaiting Customer item, including client-side settings.
- **Status mapping**: Dev Todo when a dev is named but nothing says work started; In Dev once the dev says they will do it or are reproducing; Dev Review when PRs are raised or an RCA awaits validation; Research when an RCA is pending; Dev Testing when a fix is on the env and a sanity test is pending; In QA or In UAT when a fix is applied and awaiting confirmation (these are completed-category statuses meaning "reached test"); Done only under the closing rule above; Awaiting Customer when the client holds the next step.
- **Priority**: client-raised bugs default to urgent. Lower to high once the client is unblocked but a permanent fix is pending.
- **Done-when-EB-filed is not a convention.** A TEK ticket closed while its EB ticket is open is a bucket 4 item; check who closed it.
- **No tickets for finance delivery planning** (CFO Suite MoM items) on TEK.
- **Skip buckets 6 and 7 writes; defer bucket 8** until the user asks.

## Field rules (set 22 Oct, apply to every ticket you touch or create)

- **Every Slack issue since 1 Sep is on the board** with status and assignees current. The master list is the "Tekion_Delivery_Issues" sheet (`1MJd6WQhmoFJAZ16lzw1-8CxmxyGiRZhpOLHfCn4GExY`, tab Issues): every row must map to a TEK ticket by key or Slack thread link; a row with no ticket and no thread is verified by hand before anything is created, and may be a duplicate.
- **Type, Module, Environment and Dev Category are never left empty.** Type: Bug for anything raised as broken, Task for config, security and infra work, Feature for new asks, Improvement for behaviour changes. Dev Category follows who fixes it: BE, UI, UI+BE, Connector, DevOps, Infra, Config.
- **Category** is single-select. Set `RCA Review` on every incident ticket whose Category is empty or `Monday Migrated`; once the `RCA Added` option exists, use it instead when a root cause is written on the ticket. Keep an existing Blocker, Config Tasks or Review Needed. Leave Category empty on Canceled and Duplicate tickets and on plain tasks or features. `Monday Migrated` must not remain on any ticket in a completed status.
- **Priority** is never left at none. Excel P0 → Urgent, P1 → High, P2 → Medium. Otherwise: Urgent when the client is blocked or a prod incident is open, High once the client is unblocked or for internal critical work, Medium for features and config asks, Low for cleanups.
- `scripts/condense_board_cf.py` prints these fields per ticket so gaps can be audited in one pass.

## Known traps

- `fetch_issues` with `search` returns full descriptions. Keep `size` small or you flood context.
- A mass edit on 20 Oct touched most tickets; `updated` dates around then are noise. Use `createdTime` and the Slack thread, not `modifiedTime`, to judge recency.
- `completedAt` is stamped on entering In QA, not Done.
- Two Devangs: `devang@` is DevOps, `vaghani.devang@` is a BE developer.
- Subagent thread summaries miss resolutions. Read threads yourself.
- The Atlas MCP server can disconnect mid-session; reload tools with ToolSearch before retrying.
- `fetch_issues` with `search` needs `scopeId` (the team id) as well as `scope`, and returns full descriptions: keep `size` at 5.
- `slack_send_message` takes the body in `message`, not `text`.
- The board moves while you work: others close tickets during the day. Re-read each ticket with `fetch_issue_details` (it returns `version`) right before writing, and when a ticket you meant to move was closed by someone else, comment with the Slack facts and tell the user instead of silently overriding.

## Closing a window

Recap per bucket: ticket, change made, state (closed or waiting on whom). Name anything you left undone and why. Then offer the next window: the 10 days before the one just finished.
