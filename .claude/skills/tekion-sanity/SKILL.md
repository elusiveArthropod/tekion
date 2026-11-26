---
name: tekion-sanity
description: Post-deployment platform sanity for the Tekion UnifyApps tenants (Pre-prod .xyz or Prod). Runs the product checks in parallel (Solution Builder build of a medium-size app, Workflow Builder agent understand+make, AI FDE copilot UI, Q&A and CRUD, Evaluation create+run) while watching the automation alert channel, posts every result to Slack the moment it is known, and loops on the alert channel until the watch window ends. Use whenever the user says run sanity, start sanity, post-deployment check, validate the platform after a tag deploy, or invokes /tekion-sanity. Always collect the required inputs before touching anything.
---

# Tekion post-deployment sanity

Purpose: nobody should have to sit online at midnight after a Tekion deploy. This skill does the sanity, posts evidence to Slack as each check finishes, and only a ❌ needs a human. It starts **after** the deployment and config sync are complete; it does not check Grafana or pod state.

Hard rules:

- **Never start without the inputs in "Inputs".** Ask for the missing ones in one message and wait.
- **Post to Slack after every check finishes**, pass or fail, not at the end. The first post lists how many checks are running so the team always knows what is left if the cookie dies.
- **Pass/fail is defined per check in `references/checks.md`.** Do not soften a FAIL because the failure "looks unrelated". Report it, classify it, let the human decide.
- **Every FAIL carries evidence**: a session or run link, the exact error text in a code block, and a screenshot path or Slack upload. A FAIL with no evidence is not allowed.
- **Cookie expiry is its own status (⚠️ AUTH_EXPIRED)**, never reported as a platform failure. When it happens, post what is left and ask the user for a fresh cookie, then resume only the unfinished checks.
- **Clean up what you created** (solution, dataset, test cases, experiment) at the end, in Prod and Pre-prod alike. Report anything you could not delete.
- The API token and the browser cookie go into `chmod 600` files in the scratchpad and are passed by path. Never print them, never put them in Slack, never commit them.
- Slack messages: no model names, no hedging. Status, evidence, next action.

## Inputs

Ask for all of these in one message; the user replies in one message. Defaults apply unless overridden.

| Input | Required | Default |
|---|---|---|
| Environment name | yes | — (`PRE-PROD` or `PROD`, plus tenant name) |
| Platform base URL | yes | — e.g. `https://finance.toc.tekioncloud.xyz` |
| API token (`x-ua-at` value, looks like `2_<uuid>_00`) | yes | — used for every `/api/*` call |
| Browser session cookie (full `Cookie:` request header from DevTools → Network on any platform page) | yes | — used for every UI page; the API token does not work as a cookie |
| Alert channel (Slack link or id) where failed automation runs are posted | yes | — |
| Results channel | no | `C0CLBMLJ10T` |
| AI Teams team id (Solution Builder) | no | `e_69a84345925f136d9c9e437e` (same id across tenants) |
| FDE agent id | no | `e_ai_fde_agent` (the user-facing surface is the `AI FDE` copilot panel in the top bar) |
| Solution Builder prompt | no | the fixed prompt in `references/checks.md` |
| FDE questions | no | the two in `references/checks.md` |
| Alert watch window | no | 60 minutes after start, and never closes sooner than 10 minutes after the last product check finishes |
| Workflow Builder agent id or URL | yes unless `WFB` is skipped | — |
| Sanity project name or id (where WFB and FDE-CRUD create and delete objects) | yes unless both are skipped | — |
| Existing automation name for the WFB "understand" step | no | the previous run's leftover, else ask |
| Checks to skip (product absent in this env) | no | none |

Store both credentials in `chmod 600` files (`install -m 600 /dev/null <scratchpad>/sanity/token.txt`, same for `cookie.txt`) and verify both before announcing anything:

```
bash .claude/skills/tekion-sanity/scripts/ua_api_hdr.sh <base> <token-file> POST /api/entity/dataset '{"page":{"limit":1,"offset":0}}'
node .claude/skills/tekion-sanity/scripts/ua_probe.mjs --url <base>/p/0/ai-agents/<agentId>/configuration/instructions --cookie-file <cookie-file> --out <scratchpad>/sanity --name authcheck
```

The first must return HTTP 200; the second must exit 0 (exit 2 is a login redirect). If either fails, the credential is already dead. Say which one and stop; do not post the plan.

## Process

### 1. Initialise and announce

```
python3 .claude/skills/tekion-sanity/scripts/sanity_state.py <scratchpad>/sanity/state.json init \
  --env "<ENV>" --base-url <base> --checks "SB,WFB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS" --window-min <N>
python3 .claude/skills/tekion-sanity/scripts/sanity_state.py <scratchpad>/sanity/state.json render --plan
```

Post the rendered plan to the results channel with `slack_send_message`. If the renderer printed `=====PART n/N` separators, the first part is the root post and each later part is a reply in its thread, sent in order, one call at a time. Save the returned `ts` with `sanity_state.py ... slack-ts <ts>`. Every later post is a **reply in that thread** (`thread_ts`).

The ALERTS "since" marker is the moment the user provided the inputs; `init` stores it as `alert_since`. Alerts posted to the alert channel before that moment are never read, reported or counted. The team does not want to see failures that predate this run.

### 2. Launch the checks in parallel

Launch one `Agent` (subagent_type `general-purpose`, `run_in_background: true`) per product check, all in a single message: `SB`, `WFB`, `FDE-UI`, `EVAL`, and one agent that runs `FDE-QA` then `FDE-CRUD` in sequence (same chat surface, and CRUD must not interleave with the questions). Keep `ALERTS` in the main session (it is cheap Slack reading and it needs to loop).

`WFB` and `FDE-CRUD` write to the tenant. They are confined to the Sanity project from the inputs and must diff that project before and after. If the user has not named a Sanity project, skip both and say so in the plan post; never let them run against an unnamed project.

Each agent prompt must contain, verbatim: the base URL, the token file path, the cookie file path, the scratchpad output dir, the results channel id and thread ts, the state file path, the check id, and the full procedure for that check copied from `references/checks.md` (the agent cannot see this conversation). Tell it to:

1. Run the procedure, using `scripts/ua_probe.mjs` with the cookie file for browser steps and `scripts/ua_api_hdr.sh` with the token file for API calls (`references/platform-api.md` has the verified calls and the auth rules).
2. Decide PASS / FAIL / AUTH_EXPIRED / SKIPPED strictly by the criteria.
3. Update the state file (`sanity_state.py ... set <check> <status> "<note>" --evidence <url>`).
4. Post its result as a thread reply using the format in `references/slack-templates.md`, with a screenshot uploaded on FAIL.
5. Return a short report: status, note, evidence paths, anything it created and whether it was deleted, and any selector or API detail it had to discover (so it can be recorded in `references/platform-api.md`).

Mark each check RUNNING in the state file as you launch it.

### 3. Loop: ALERTS tick plus progress

The alert channel is fed by an automation that posts failed runs **every 5 minutes**, so a failure caused by a product check shows up to 5 minutes after it happened. Right after launching, do the first ALERTS tick (procedure in `references/checks.md`), then call `ScheduleWakeup` with `delaySeconds` 300 and the prompt `continue tekion-sanity loop`. On every wakeup:

1. Read `slack_read_channel` on the alert channel, messages with ts newer than `alert_since` and newer than the last one already recorded. For each **new** failed-run alert: open its thread, open the run link with `ua_probe.mjs`, extract the failing node and the error text, find the parent (which agent, knowledge base, application or connector the node belongs to), and judge whether it is plausibly caused by the deployment (new error signature, started after deploy time, touches the deployed component) or pre-existing noise. Post one thread reply per new failure in the results thread, format in the templates file, and append it to `state.json` under `alerts` as `{"ts": <slack ts>, "name": <automation>, "classification": "deployment-suspect" | "pre-existing" | "sanity-triggered" | "tbd"}` so the final post can count them. Do not re-report an alert already recorded.
2. If a subagent finished (its result arrived), make sure its Slack post exists; if the agent crashed without posting, post the FAIL yourself with its error.
3. If any check reported AUTH_EXPIRED: post the ⚠️ message listing remaining checks and ask the user in chat for a fresh cookie. On receiving it, overwrite the cookie file, verify it, relaunch only the unfinished checks.
4. Schedule the next wakeup: 300 s while checks are running or the window is open; `noop: true` when nothing changed.

The loop ends when **all** of:

- every product check is terminal;
- at least **10 minutes** have passed since the last product check finished, so the 5-minute alert poster has run at least once over the runs those checks triggered (record the finish time of the last check in the state file, `sanity_state.py ... set` updates `updated`);
- the watch window (`window_min`, default 60 from start) has elapsed;
- no alert is mid-investigation.

Then `sanity_state.py ... render --final`, post it as the last thread reply (each `=====PART` part as its own reply, in order), mention the on-call person only if the verdict is ❌, and call `ScheduleWakeup` with `stop: true`.

### 4. Clean up and record

- Delete everything the run created, through the API (`references/platform-api.md`). List what could not be deleted in the final post.
- Append any newly discovered selector, API body or entity type to `references/platform-api.md` so the next run does not rediscover it. Commit that change on the session branch and push it. Never commit anything from the scratchpad.

## Reading the verdict

- ✅ all checks PASS and no new deployment-related alert: team goes to sleep.
- ❌ any check FAIL: the on-call person reads the evidence and decides on rollback. This skill recommends, never rolls back.
- ⚠️ AUTH_EXPIRED on some checks: not a platform verdict. Resume with a new cookie.
- Pre-existing alert noise is reported as such, separately from deployment-related failures. Do not let it decide the verdict, but do not hide it either.

## Traps

- A Solution Builder session that "completes" with error events in its trace is a FAIL, not a pass. Read the session, not the status badge.
- Background tabs and long builds: give `ua_probe.mjs` a `--timeout-ms` matching the budget in the checks file, not the default.
- `ua_probe.mjs` exit 2 is AUTH_EXPIRED, exit 3 is a navigation or action failure; the JSON is printed in every case. Read `visibleText`, `apiErrors` and `consoleErrors` before deciding.
- The FDE answers come from an LLM. Judge them against the acceptance terms in the checks file, not against your own opinion of a good answer.
- Slack caps a message at 5000 characters; error text goes in a code block trimmed to the first 40 lines.
- Two sanity runs must not run at once against the same tenant: their created assets would collide. Check the results channel for an open run first.
