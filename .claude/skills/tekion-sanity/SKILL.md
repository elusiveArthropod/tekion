---
name: tekion-sanity
description: Post-deployment platform sanity for the Tekion UnifyApps tenants (Pre-prod .xyz or Prod). Runs the product checks in parallel (Solution Builder build of a multi-object portal, Workflow Builder explain-and-build, AI FDE panel, how-to Q&A and CRUD-on-request, Evaluation create+run) while watching the automation alert channel, posts every result to Slack the moment it is known in a sectioned, readable format, and loops on the alert channel until the watch window ends. Use whenever the user says run sanity, start sanity, post-deployment check, validate the platform after a tag deploy, or invokes /tekion-sanity. Always collect the required inputs before touching anything.
---

# Tekion post-deployment sanity

Purpose: nobody should have to sit online at midnight after a Tekion deploy. This skill does the sanity, posts evidence to Slack as each check finishes, and only a ❌ needs a human. It starts **after** the deployment and config sync are complete; it does not check Grafana or pod state.

Hard rules:

- **Never start without the inputs in "Inputs".** Ask for the missing ones in one message and wait.
- **Post to Slack after every check finishes**, pass or fail, not at the end. The first post lists how many checks are running so the team always knows what is left if the cookie dies.
- **Every Slack post follows the formatting rules in `references/slack-templates.md`**: headline line, blank line, bold section labels, bullets, named links, error text in one trimmed code block. The first run's posts were one dense paragraph each and the team could not scan them. Bold is `**x**` (the send tool converts Markdown; `*x*` renders italic).
- **Pass/fail is defined per check in `references/checks.md`.** Do not soften a FAIL because the failure "looks unrelated". Report it, classify it, let the human decide.
- **Agent checks judge platform state, not the agent's reply.** A builder saying "done" or the FDE saying "created" counts for nothing until the canvas, the app or the entity API shows it.
- **Every FAIL carries evidence**: a session or run link, the exact error text in a code block, and a screenshot path or Slack upload. A FAIL with no evidence is not allowed.
- **Cookie expiry is its own status (⚠️ AUTH_EXPIRED)**, never reported as a platform failure. When it happens, post what is left and ask the user for a fresh cookie, then resume only the unfinished checks.
- **Clean up what you created** (solution, automation, datasets, test cases, experiment) at the end, in Prod and Pre-prod alike. Record every asset with `sanity_state.py ... created add` so the final post lists what was deleted and what was not. A sanity automation is never deployed.
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
| Workflow Builder agent id | no | `e_6aa19955aeb9ea1371af57c7` (Pre-prod finance; confirm per tenant with `GET /api/entity/ai_agent/<id>`) |
| Existing automation id for the Workflow Builder to explain | no | `6ab21aea970f873408436c68` (`Node Failure Alert - Finance`, Pre-prod finance only; ask for one on any other tenant) |
| FDE agent id | no | `e_ai_fde_agent` (the user-facing surface is the `AI FDE` copilot panel in the top bar) |
| FDE CRUD target | no | an evaluation `dataset` named `sanity-fde-<env>-<stamp>` (verified API); an override needs its verification calls discovered first |
| Solution Builder prompt | no | the fixed vendor-invoice portal prompt in `references/checks.md` |
| Workflow Builder prompts | no | the fixed explain and build prompts in `references/checks.md` |
| FDE questions | no | the two in `references/checks.md` |
| Alert watch window | no | 60 minutes after start, and never closes sooner than 10 minutes after the last product check finishes |
| Checks to skip (product absent in this env, or FDE is read-only by design) | no | none |

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
  --env "<ENV>" --base-url <base> --checks "SB,WB,FDE-UI,FDE-QA,FDE-CRUD,EVAL,ALERTS" --window-min <N>
python3 .claude/skills/tekion-sanity/scripts/sanity_state.py <scratchpad>/sanity/state.json render --plan
```

Drop skipped checks from `--checks`. Post the rendered plan to the results channel with `slack_send_message`. Save the returned `ts` with `sanity_state.py ... slack-ts <ts>`. Every later post is a **reply in that thread** (`thread_ts`).

The ALERTS "since" marker is the moment the user provided the inputs; `init` stores it as `alert_since`. Alerts posted to the alert channel before that moment are never read, reported or counted. The team does not want to see failures that predate this run.

### 2. Launch the checks in parallel

Launch one `Agent` (subagent_type `general-purpose`, `run_in_background: true`) per product check, all in a single message: `SB`, `WB`, `FDE-UI`, `FDE-QA`, `FDE-CRUD`, `EVAL`. Keep `ALERTS` in the main session (it is cheap Slack reading and it needs to loop).

`FDE-QA` and `FDE-CRUD` both drive the AI FDE copilot panel; they run in separate browsers and separate chats, so they do not collide. `SB` and `WB` both load the platform's LLM path; that is intended, the alert watch is what catches what they trigger.

Each agent prompt must contain, verbatim: the base URL, the token file path, the cookie file path, the scratchpad output dir, the results channel id and thread ts, the state file path, the check id, the `<stamp>`, and the full procedure for that check copied from `references/checks.md` (the agent cannot see this conversation). Also paste the "Formatting rules" section and the relevant template from `references/slack-templates.md`. Tell it to:

1. Run the procedure, using `scripts/ua_probe.mjs` with the cookie file for browser steps and `scripts/ua_api_hdr.sh` with the token file for API calls (`references/platform-api.md` has the verified calls and the auth rules).
2. Decide PASS / FAIL / AUTH_EXPIRED / SKIPPED strictly by the criteria.
3. Update the state file (`sanity_state.py ... set <check> <status> "<note>" --evidence <url>`) and record every asset it created (`sanity_state.py ... created add <check> "<what>" --deleted yes|no`).
4. Post its result as a thread reply in the template format, with a screenshot uploaded on FAIL.
5. Return a short report: status, note, evidence paths, anything it created and whether it was deleted, and any selector or API detail it had to discover (so it can be recorded in `references/platform-api.md`).

Mark each check RUNNING in the state file as you launch it.

### 3. Loop: ALERTS tick plus progress

The alert channel is fed by an automation that posts failed runs **every 5 minutes**, so a failure caused by a product check shows up to 5 minutes after it happened. Right after launching, do the first ALERTS tick (procedure in `references/checks.md`), then call `ScheduleWakeup` with `delaySeconds` 300 and the prompt `continue tekion-sanity loop`. On every wakeup:

1. Read `slack_read_channel` on the alert channel, messages with ts newer than `alert_since` and newer than the last one already recorded. For each **new** failed-run alert: open its thread, open the run link with `ua_probe.mjs`, extract the failing node and the error text, find the parent (which agent, knowledge base, application or connector the node belongs to), and judge whether it is plausibly caused by the deployment (new error signature, started after deploy time, touches the deployed component) or pre-existing noise. Post one thread reply per new root cause in the results thread, format in the templates file, and record each alert with `sanity_state.py ... alert add`. Do not re-report an alert already recorded.
2. If a subagent finished (its result arrived), make sure its Slack post exists; if the agent crashed without posting, post the FAIL yourself with its error.
3. If any check reported AUTH_EXPIRED: post the ⚠️ message listing remaining checks and ask the user in chat for a fresh cookie. On receiving it, overwrite the cookie file, verify it, relaunch only the unfinished checks.
4. Schedule the next wakeup: 300 s while checks are running or the window is open; `noop: true` when nothing changed.

The loop ends when **all** of:

- every product check is terminal;
- at least **10 minutes** have passed since the last product check finished, so the 5-minute alert poster has run at least once over the runs those checks triggered (record the finish time of the last check in the state file, `sanity_state.py ... set` updates `updated`);
- the watch window (`window_min`, default 60 from start) has elapsed;
- no alert is mid-investigation.

Then `sanity_state.py ... render --final`, post it as the last thread reply, mention the on-call person only if the verdict is ❌, and call `ScheduleWakeup` with `stop: true`.

### 4. Clean up and record

- Delete everything the run created, through the API (`references/platform-api.md`) or the UI where there is no API path (solution, automation). The final render lists what could not be deleted from the `created` records.
- Append any newly discovered selector, API body, entity type or the FDE tool list to `references/platform-api.md` so the next run does not rediscover it. Commit that change on the session branch and push it. Never commit anything from the scratchpad.

## Reading the verdict

- ✅ all checks PASS and no new deployment-related alert: team goes to sleep.
- ❌ any check FAIL: the on-call person reads the evidence and decides on rollback. This skill recommends, never rolls back.
- ⚠️ AUTH_EXPIRED on some checks: not a platform verdict. Resume with a new cookie.
- Pre-existing alert noise is reported as such, separately from deployment-related failures. Do not let it decide the verdict, but do not hide it either.
- `FDE-CRUD` FAIL with "no create/update/delete capability": the agent declined every write. That is a FAIL until the team confirms the FDE is read-only by design on that tenant; then it goes into "Checks to skip".

## Traps

- A Solution Builder session that "completes" with error events in its trace is a FAIL, not a pass. Read the session, not the status badge.
- The SB functional script has eight assertions; run all of them and report each, do not stop at the first false one. The failed assertion numbers are what makes the FAIL actionable.
- Workflow Builder "stuck in thoughts" (thinking indicator, no text, several minutes) is a known failure signature (TEK-657, Oct 2026). Report it by that name with the session link; check the executor automation `67850d225384a9541846f5b9` for `does not match the required format`.
- A sanity automation (`sanity-<env>-<stamp>-wb`) is a draft only. Never deploy it; a scheduled automation left deployed fires every weekday on a customer tenant. Delete it and verify it is gone.
- FDE-CRUD acts only on `sanity-fde-<env>-<stamp>`. Never ask the FDE to create, change or delete anything else, and never on a Prod tenant without the user naming the target.
- Background tabs and long builds: give `ua_probe.mjs` a `--timeout-ms` matching the budget in the checks file, not the default.
- `ua_probe.mjs` exit 2 is AUTH_EXPIRED, exit 3 is a navigation or action failure; the JSON is printed in every case. Read `visibleText`, `apiErrors` and `consoleErrors` before deciding.
- Agent replies come from an LLM. Judge them against the acceptance terms in the checks file, not against your own opinion of a good answer.
- Slack caps a message at 5000 characters; error text goes in a code block trimmed to the first 15 lines, the full text as a file upload.
- Two sanity runs must not run at once against the same tenant: their created assets would collide. Check the results channel for an open run first.
