# Slack message formats

Channel: results channel (default `C0CLBMLJ10T`). The first message is the plan, rendered by `sanity_state.py render --plan`. Everything else is a reply in that thread. Users as `<@U…>`. No model names.

Formatting rules, learned from the first runs (the posts were too dense to scan at midnight):

- One idea per line. A blank line between the headline, the detail, and the evidence.
- Headline: icon, two spaces, bold check id and status. Nothing else on that line.
- Labels in bold followed by three spaces, then the value: `*Session*   <url>`.
- Error text always in a fenced code block, trimmed to 40 lines. Never inline.
- Links as `<url|short label>`, never bare URLs longer than one line.
- One emoji per message, the status icon. No decorative emoji.
- Under 1500 characters per reply; split evidence into a second reply if needed.
- Times in IST, `HH:MM IST`.

## Check result (one reply per check, posted the moment it finishes)

PASS:

```
✅  *FDE-UI — PASS*

Copilot panel opens with the greeting and 3 conversation starters.

*Evidence*   <https://…|screenshot> · 14:12 IST
```

FAIL:

```
❌  *SB — FAIL*

Build completed in 31 min, but the session trace has 2 error steps.
Functional checks not run because the generated app did not load.

*Session*   <https://…|observability session>
*Failing step*   Generate data model

```
<first 40 lines of the error text>
```

*Suspected area*   Solution Builder → data-model agent (knowledge call timed out)
*Next*   on-call to confirm whether the same error appears in the alert channel
```

Upload the screenshot to the thread on FAIL (`slack_get_file_upload_url` → `slack_complete_file_upload`), as a separate reply right after the result.

AUTH_EXPIRED:

```
⚠️  *EVAL — PAUSED*

The API token expired at step "poll experiment runs".

*Still to finish*   EVAL, SB
*Needed*   a fresh token in the chat; nothing else is affected.
```

SKIPPED:

```
⏭️  *WFB — SKIPPED*

Workflow Builder agent is not present in this tenant (confirmed by <@U…>).
```

## New alert from the alert channel (one reply per failure)

```
🔔  *New failed run — Load Case Sync*

*Failing step*   Session variable → Set case payload
*Links*   <https://…|alert thread> · <https://…|run>

```
<error message, trimmed>
```

*Depends on*   agent `Case Extractor` → knowledge base `Tekion DMS docs`
*Verdict*   deployment-suspect — new error signature, first seen 14:20 IST
```

Verdict wording, pick one:

- `deployment-suspect — <why: new signature / touches deployed component / matches SB error>`
- `pre-existing — same error seen before deploy (<link>)`
- `triggered by this sanity run — <check id>, counted against that check`
- `root cause TBD — next check: <what>`

## Progress (only when the user asks, or after a resume)

`sanity_state.py render --progress`.

## Final (last reply; mention on-call only on ❌)

`sanity_state.py render --final`, then two lines:

```
*Cleanup*   deleted: solution, dataset, 2 test cases, experiment · not deleted: none
<@oncall>   decision needed: rollback or hotfix. Evidence is in this thread.
```

The second line only on ❌.
