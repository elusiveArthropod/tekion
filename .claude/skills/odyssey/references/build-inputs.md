# ODYSSEY build inputs: what to collect from the user before the first build step

Ask for these in **one message** at the Phase 3 gate ("design agreed, here is what I need to start building"), as a table: item, why it is needed, how to hand it over. Then **verify each one with a read-only probe** before writing anything, and record the result (never the secret) in the state file.

## 1. Target platform

| Ask | Example | Verify by |
|---|---|---|
| Platform host / tenant / environment | `finance.toc.tekioncloud.xyz`, "Finance pre-prod" | one authenticated read (`/api/user-context`, `/api/user/logged-in-user`) that names the tenant and the environment |
| Which environment is the build for, and which must never be touched | pre-prod only; prod excluded | restate it; put it in the state file as a decision |
| Naming and tagging rules | tag `alert-monitoring`; no project folder | create one throw-away object or automation with the tag and read it back |

## 2. Authentication

Order of preference, say it to the user:
1. **Service identity**: an API token or a dedicated platform user for the system being built. Outlives the build, scoped, revocable.
2. **A person's API token** (UnifyApps Headless / Nebula style): acceptable for the build, must be replaced before go-live.
3. **A browser session cookie** (`_at=…` on UnifyApps): discovery and build only. Dies with the person's login. Say that each time.

Handling rules, whichever is given:
- Take it through the secure credential form when the tool exists; otherwise accept it in chat, use it, and tell the user to rotate it after the build. Never write a value into the repo, the sheet or the state file; write *where it lives* and *who owns it*.
- Record the cookie/header **name** and the host it is for (on UnifyApps: cookie `_at`, header `Origin: https://<host>`).
- Verify with one read call. If it fails, stop and ask; do not guess cookie names (that cost an hour on Sentinel).

## 3. Connections the design needs

For every external system in the design (Slack, Jira/Atlas, email, HTTP app, database):

| Ask | Example | Verify by |
|---|---|---|
| Connection name and id on the platform | Slack `Sentinel \| Jay`, `6b07126be1098f3f51e57be4` | `list_connections` by name; confirm `active` |
| Which identity it acts as | bot user id, email | a "who am I" call through the connection (`slack_get_user_info`) |
| Destination ids | channel `C0CKNN7U4M9`, board id, mailbox | a read on the destination (members, history) |
| Inbound event wiring | Slack app Event Subscriptions and Interactivity request URLs → the connection's webhook URLs | ask for a test event (one click, one message) and check a trigger run exists; no run = wiring problem, not code |
| Who owns the connection | the person whose app/token it is | name in the state file |

## 4. Test fixtures

| Ask | Why |
|---|---|
| Permission to create a test entity that fails or fires on demand (`sentinel · test-failure`) | end-to-end checks without waiting for real events |
| A real sample payload, not the documented schema | the observed shape differed from the docs on Sentinel |
| Known noise to exclude from day one | the old system's exclusion list, test automations, by-design failures |

## 5. Operational

| Ask | Why |
|---|---|
| Pause / stop mechanism and who may use it | the user asked to stop everything for load within hours |
| Load and volume expectations | decides batch sizes, retention, exclusions |
| Who gets tagged, escalated to, and the group/user ids | hard-code nothing you can look up |
| Shadow mode wanted before going live? | lets the pipeline run without reaching people |

## Template message

```
Design agreed. Before step 1 I need:
1. Platform: host + environment, and the tag/naming rule.            → I verify with one read.
2. Auth: ideally a service token; a session cookie works for the build (name + value, rotate after).
3. Connections: <system>: connection id, destination ids (channel/board), who owns it.
4. Inbound events: <app> event + interactivity URLs pointed at the connection's webhooks.
5. A test entity I may create to fire events on demand: yes/no.
6. Known exclusions and the pause rule.
I will probe each one read-only and report before building anything.
```
