# Slack message formats

Channel: results channel (default `C0CLBMLJ10T`). First message is the plan, rendered by `sanity_state.py render --plan`. Everything else is a reply in that thread. Users as `<@U…>`. No model names.

## Formatting rules (the first run's posts were judged too congested)

`slack_send_message` converts **Markdown** to Slack formatting. Verified from the 2026-11-25 thread: text sent as `*x*` rendered _italic_, so bold needs `**x**`. Write Markdown, not Slack mrkdwn.

1. **Headline first, on its own line**: status icon, check id in backticks, status word in bold, then one sentence that says what happened. Someone reading only this line must know the outcome.
2. **Blank line between sections.** Never run two sections together.
3. **Sections are a bold label on its own line, then bullets** (`- ` in Markdown, renders as •). Fixed labels, in this order, only the ones that apply: `**What was checked**`, `**What failed**`, `**Evidence**`, `**Error**`, `**Suspected area**`, `**Created / cleaned up**`, `**Next**`.
4. **One idea per bullet, at most two sentences.** If a bullet needs a third sentence, it is two bullets.
5. **Links are named**: `<url|Session>`, `<url|Run>`, `<url|Screenshot>`. Never a bare URL, never a bare `link`.
6. **Error text goes in one fenced code block under `**Error**`, trimmed to 15 lines.** If there is more, upload the full text as a file to the thread (`slack_get_file_upload_url` → `slack_complete_file_upload`) and say "full text attached".
7. **Numbers and ids stay out of prose**: put them in their bullet (`Q1 447 words`, `node 30 "Invalid model"`), not in the headline sentence.
8. **Whole message under about 25 lines.** Longer than that means the analysis belongs in the evidence file, not in the post.
9. Code spans only for check ids, asset names, node names and ids. Not for emphasis; bold is for emphasis.
10. Nothing about how the result was reached, no hedging, no "it seems". Status, evidence, next action.

## Check result (one per check, posted the moment it finishes)

PASS (short; two or three bullets of evidence are enough):

```
✅ `FDE-QA` **PASS** · both platform questions answered with the expected terms

**What was checked**
- Q1 API connection how-to: 447 words, mentions connector, authentication, endpoint
- Q2 daily 9 AM schedule: 254 words, mentions schedule, trigger, cron

**Evidence**
- <url|Copilot session>
```

FAIL:

````
❌ `SB` **FAIL** · build finished but the Approvals page was never built

**What failed**
- Approvals page is empty with no data connections, so approve/reject and the approval history were not delivered
- Functional script: 3 of 8 assertions failed (approve invoice, two-approval rule, dashboard total)

**Evidence**
- <url|Session> · <url|Screenshot>

**Error**
```
Invalid LLM model: modelId
rejected modelId: e_69aeb0831adff145d2eb5885
```

**Suspected area**
- Shared `Call LLM (AI Agent)` automation rejects the model id used by the Solution Builder agents

**Created / cleaned up**
- Partial solution `sanity-preprod-finance-20261126-0210` deleted
````

Upload the screenshot to the thread on FAIL as a separate file post with a one-line caption.

AUTH_EXPIRED:

```
⚠️ `EVAL` **PAUSED** · session cookie expired at step "run experiment"

**Next**
- Remaining checks: `EVAL`, `SB`
- Waiting for a fresh cookie in chat; nothing else is affected
```

SKIPPED:

```
⏭️ `EVAL` **SKIPPED** · Evaluation module not present in this tenant (confirmed by user)
```

## New alert from the alert channel (one per failure)

````
🔔 **New failed run since deploy** · `<automation or agent name>` · node "<failing node>"

**What failed**
- <one sentence: which node, which parent it depends on>
- <one sentence: whether one of this run's checks triggered it, and which>

**Evidence**
- <alert thread link|Alert> · <run link|Run>

**Error**
```
<error message, trimmed to 15 lines>
```

**Classification**
- **Deployment-suspect** · new signature, first seen HH:MM, touches <product under sanity>
  or: **Pre-existing** · same error seen before deploy (<link|example>), verdict-neutral
  or: **Root cause TBD** · next check: <what to look at>
````

Several alerts with one root cause: one post, headline names the root cause, one bullet per affected automation under **What failed**. Do not post the same root cause five times.

Alerts that are not failures (for example an "In Progress" alert): one short post, headline says "not a failed run", one bullet on why it is listed, classification line. No error block.

## Progress (only when the user asks, or after an AUTH_EXPIRED resume)

`sanity_state.py render --progress`.

## Final (last reply; mention on-call only on ❌)

`sanity_state.py render --final`. It already contains the verdict, the grouped check rows, the alert counts and the cleanup list (fed from `sanity_state.py ... created add` and `alert add` during the run). On ❌ append one line after a blank line:

```
<@oncall> decision needed: rollback or hotfix. Evidence is in the posts above.
```
