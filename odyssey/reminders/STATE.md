# ODYSSEY: Reminders (Slack notifications for the user's reminder work)

Phase: 1 Discovery  ·  Started: 26 Nov 2026  ·  Last update: 26 Nov 2026

Slug `reminders` is provisional until the user confirms what the thing is.

## Problem
User's words: "i wanted to create an slack app which notify me about my reminder works".
Mine: the user has things they must remember to do or follow up on (nature and source not yet known) and wants Slack to tell them about those things at the right moment. Whether the right vehicle is a standalone Slack app, a UnifyApps automation on an existing Slack connection, or Slack's own reminders is not yet decided.

## Goal and success criteria
- Goal: (open; see Q1–Q4)
- Success looks like: (open)
- Out of scope (v1): (open)

## Constraints, dependencies, assumptions
- Evidence in the repo: the user runs Tekion delivery; work is tracked on the Atlas TEK board (team 2604063610, project 8118998788, In Dev view f1c656a2d450); the client channel is #tekion-delivery (C0A1EPNSLJ1); a Slack connection `Sentinel | Jay` (6b07126be1098f3f51e57be4) already exists on the Finance pre-prod tenant; Sentinel's planned Flow C already has "reminders" and "ETA chase" for failure issues.
- Assumption to confirm: "reminder works" means the user's own follow-ups and due items, not Sentinel's issue reminders.
- Platform gotcha carried over from Sentinel: a Slack app has one Event Subscriptions URL and one Interactivity URL; they must point at one connection's webhooks.

## Decisions (numbered; never delete, supersede)
| # | Date | Decision | Why | Supersedes |
|---|---|---|---|---|
| | | none yet | | |

## Open questions (numbered; owner; blocks what)
| # | Question | Owner | Blocks | Status |
|---|---|---|---|---|
| 1 | What is a "reminder work"? Where do these items live today (Atlas tickets, Slack /remind, a sheet, calendar, head)? Three real examples. | user | everything | open |
| 2 | Who is notified: only the user, or others too? DM or channel? | user | design | open |
| 3 | The pain: what was missed last time and what did it cost? | user | goal, success criteria | open |
| 4 | What triggers a notification: a due time, N days before an ETA, a stale item, a fixed daily digest, an event? | user | design | open |
| 5 | After the ping: inform only, or act (done / snooze / reschedule buttons), or two-way (create reminders from Slack)? | user | design, Slack app needs | open |
| 6 | Is a standalone Slack app the requirement, or is "notifications in Slack" the requirement and the vehicle is open? Why are Slack /remind and Atlas notifications not enough? | user | design | open |
| 7 | Where does it run: a UnifyApps tenant (which), or code hosted elsewhere (where)? | user | build | open |
| 8 | Timezone, quiet hours, cap on pings per day? | user | design (can wait) | open |
| 9 | Success in a month: what number moves? | user | success criteria | open |
| 10 | Access: can the user create a Slack app in the workspace (or must Jay)? Atlas MCP read access for the reminder source? | user | build (can wait) | open |

## Proposed, not yet decided
- (user) A Slack app that notifies the user about reminder work.
- (Claude) If the source is the TEK board, the notifier could be a scheduled UnifyApps automation on the existing Slack connection rather than a new Slack app.

## Case catalog / scenarios
not started

## Solution design
not started

## Build log
| Step | Built | Verified how | Ids | Date |
|---|---|---|---|---|

## Platform gotchas learned
-

## Known gaps and deferred items
-

## Assets
none yet

## Resume notes
- Where to pick up: Phase 1, waiting on the user's answers to Q1–Q10.
- What is paused / live: nothing built.
- First thing to check: the answers; then look at the real reminder source (board, channel, sheet) before designing.
