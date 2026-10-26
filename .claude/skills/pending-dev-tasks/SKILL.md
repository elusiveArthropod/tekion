---
name: pending-dev-tasks
description: Generate the "Tekion - Pending Dev Tasks" status update for #tekion-delivery from the Tekion Tasks (TEK) board in Atlas, in the exact Slack format Shikha has been posting, and deliver it as a DM draft or a channel post. Use this whenever the user asks for a status update, pending dev tasks, open items post, the In Dev board as a Slack message, a board summary for leadership, or says "post the pending tasks" or "status update like the 16 Sep one". Do NOT use for reconciling the board with Slack (that is tekion-board-sync) or for one ticket's detail.
---

# Pending Dev Tasks status update

One Slack post that lists every in-progress TEK ticket grouped by who fixes it, with a one-line state, owners, the ticket link, the originating Slack thread, ETA and age. Leadership reads it; the owners are named in it. A wrong state line is worse than a missing one, so every state line must be backed by the thread or the ticket, not by memory.

The exact template, with a filled example line, is in `references/template.md`. Read it before composing.

## Inputs

- Board: team Tekion Tasks, id `2604063610`, project `8118998788`.
- Source view: the **In Dev** saved view, id `f1c656a2d450` (`fetch_issues` with `scope: "view"`, `scopeId: "f1c656a2d450"`, `size: 50`). It holds every ticket in Backlog, Dev Todo, Research, In Dev, Dev Review, Dev Blocked and Dev Testing. If the user names another view or a status set, use that instead.
- Reference format: the 16 Sep post `https://unifyapps.slack.com/archives/C0A1EPNSLJ1/p1789533939856089`. Read it with `slack_read_thread` only if `references/template.md` looks out of date.
- Ids for fields, statuses and people: `../tekion-board-sync/references/ids.md`.

## Process

### 1. Pull the view and condense it

`fetch_issues` on the view returns 100+ KB and is saved to a file. Do not read it; run

```
python3 -I .claude/skills/pending-dev-tasks/scripts/condense_view.py <saved-file> > view.txt
```

It prints one line per ticket: key, status, priority, Dev Category, Module, Environment, title, assignees, raised-on date, open days, Slack thread links, other links. It also writes `view.json` next to the input for the composition step.

Raised-on is the date of the **earliest Slack thread linked on the ticket**, not the ticket's creation date. Most tickets were created days or weeks after the thread, and the age must reflect when the client raised it. Fall back to `createdTime` only when no thread is linked.

### 2. Make sure every ticket has a thread

Every line needs both a ticket link and a thread link. For tickets with no Slack link:

1. Search the channel: `slack_search_public_and_private` with `keywords: ["TEK-<n>"]`, `filters: in:<#C0A1EPNSLJ1>`, `response_format: "detailed"`. The reporter usually posted "ticket: <link>" inside the thread; the permalink's `thread_ts` is the thread.
2. If that fails, search by topic words from the title with `from:` the reporter and `after:` the creation date.
3. Sub-issues inherit the parent's thread; mark the item number ("thread (item 2)").
4. If nothing exists, write `_no Slack thread_` in the line. Never invent one.

When you find a thread this way, offer to add it to the ticket's `links` afterwards so the next run does not repeat the search.

### 3. Get the state line right

The state line is the part people read. For each ticket, in this order of preference:

1. The last decisive Slack message in the thread, quoted or closely paraphrased with the date ("Bhavesh 22 Oct: script needs revising, runs config sync twice").
2. The ticket's last board-sync comment or description "Status" paragraph.
3. The status name alone ("Dev Review") when nothing better exists.

Name the blocker when there is one: who owes what. "PR in review" is weaker than "PR www#33322 awaiting Abhay's review". Mark client-raised or production items with `:risk:` as the original post does.

If the board snapshot is more than an hour old, re-check status with `fetch_issue_details` for any ticket you will describe as blocked, breached or urgent. Tickets move during the day; a line that says Backlog for a ticket someone closed an hour ago costs trust.

### 4. Compose

Follow `references/template.md` exactly. Rules learned from the 16 Sep and 23 Oct posts:

- Group by Dev Category in this order: Infra / DevOps, BE, Connector, UI, UI + BE, Product, Config. Count in the header: `*BE* _*\`(16)\`*_`. Omit empty groups.
- Order inside a group by age, oldest first, unless the user wants priority order.
- One line per ticket: `` `Cat` | Title - <ticket> - _state - owners - <thread> - *ETA - X* - *raised on Nth Mon*_ _[open Nd]_ ``.
- ETA comes from the ticket's `dueDate`. If none, `*ETA - TBD*`. If a due date or a client-promised date has passed, prefix `*[ETA Breached]*`. Do not invent ETAs; say in the covering message that no ticket carries one when that is the case.
- Owners are the ticket assignees, plain names in a DM draft, Slack mentions in the channel post. Resolve mentions with `slack_search_users` only at send time; keep the resolved ids in `../tekion-board-sync/references/ids.md`.
- `[open Nd]` is today minus raised-on. Omit for tickets raised today.
- Strike through (`~...~`) a line only when the user asks to show something as just-closed.
- Footer: the leadership line from the template. `@here` goes on the channel post only, never in a DM.
- Exclude tickets closed since the snapshot. Say in the covering message which ones you dropped and why.
- No model identifiers anywhere in the post.

Write the finished post to the scratchpad (`out/status_update_<date>.md`) before sending anything.

### 5. Deliver

- Slack caps one message at 5000 characters. A 25-ticket post is about 10,000. Split on line boundaries under 4700 characters per part (`scripts/condense_view.py --split <file>` does this and writes `part1.txt`, `part2.txt`, ...). Send the parts in order, one call at a time, never in parallel, or they arrive shuffled.
- Default delivery is a **DM to the user** (`slack_send_message` with `channel_id` = their Slack user id, `U09ME1BHLEL` for Shikha) for review. Post to the channel only when the user says send, and then with mentions and `@here`.
- After sending, reply in chat with the DM link, the dropped tickets, the tickets with no thread, and the ETA gap.

## Traps

- `fetch_issues` on a view returns every status in the view, including Backlog. Do not assume "In Dev" means the In Dev status only.
- Titles like "Automation error" or "AI solution" say nothing; use the thread to write the line, and tell the user the title needs fixing.
- The board snapshot goes stale within the hour on a busy day. Six tickets were created and one closed during the 23 Oct run between the view pull and the send.
- `slack_search_public_and_private` in `concise` format drops timestamps and permalinks. Use `detailed` with `include_context: false` when you need the `thread_ts`.
- A ticket whose only Slack link is a reply permalink (`?thread_ts=...`) belongs to that parent thread; use the parent as the thread link and the reply date as raised-on only if the reply is the origin.
- Two Devangs: `devang@` (DevOps) and Devang Vaghani (BE). Check the assignee email before naming.
