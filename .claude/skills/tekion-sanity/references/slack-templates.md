# Slack message formats

Channel: results channel (default `C0CLBMLJ10T`). First message is the plan, rendered by `sanity_state.py render --plan`. Everything else is a reply in that thread. Users as `<@U…>` in `slack_send_message` text. No model names.

## Check result (one per check, posted the moment it finishes)

PASS:

```
✅ `FDE-UI` PASS — agent page and chat surface load, 3 conversation starters visible. <screenshot or page link|evidence>
```

FAIL:

```
❌ `SB` FAIL — build completed but session has 2 error steps (node "Generate data model").
Session: <url>
```error
<first 40 lines of the error text>
```
Suspected area: <agent / knowledge / application / connector, or "TBD">
```

Upload the screenshot to the thread on FAIL (`slack_get_file_upload_url` → `slack_complete_file_upload`).

AUTH_EXPIRED:

```
⚠️ `EVAL` paused — session cookie expired at step "run experiment". Remaining checks: EVAL, SB. Waiting for a fresh cookie; nothing else is affected.
```

SKIPPED:

```
⏭️ `EVAL` SKIPPED — Evaluation module not present in this tenant (confirmed by user).
```

## New alert from the alert channel (one per failure)

```
🔔 New failed run since deploy — *<automation or agent name>* (node "<failing node>")
<alert thread link> | <run link>
```error
<error message, trimmed>
```
Parent: <agent / knowledge base / application / connector it depends on>
Classification: *deployment-suspect* (new signature, first seen HH:MM) | *pre-existing* (same error seen <link> before deploy) | *root cause TBD* — next check: <what>
```

## Progress (only when the user asks, or after an AUTH_EXPIRED resume)

`sanity_state.py render --progress`.

## Final (last reply; mention on-call only on ❌)

`sanity_state.py render --final`, then one line: `Created assets deleted: <list> | Not deleted: <list or none>` and, on ❌, `<@oncall> decision needed: rollback or hotfix. Evidence above.`
