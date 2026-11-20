# P2P feedback daily digest (Outlook)

Automation: `P2P_2 | Feedback Daily Digest (Outlook)` (`6afaf31a77940a6194c173ac`), tag `p2p_2`. Created 2026-11-16 as an undeployed draft.

| Step | Node | What it does |
|---|---|---|
| 1 | `n_sched` | Schedule, cron `0 9 * * *`, Asia/Calcutta |
| 2 | `n_window` | Groovy (`window.groovy`): rolling last 24 hours before the run; fetch starts 7 days earlier |
| 3 | `n_fetch` | Fetch `p2p_feedback_collector` where agentId = P2P agent and `cTm` from 8 days back to now (up to 5000) |
| 4 | `n_build` | Groovy (`build.groovy`): metrics + HTML + subject |
| 5 | `n_mail` | Outlook send via connection `Navan x outlook test` (`6a797c338f64c9352064449a`), from `unifyapps-es@tst.tekion.com`, to `jrathod@tekion.com` |

Metrics: sessions (distinct `headerThreadTs`), questions answered (records), users (distinct `slackUserId`), response rate, helpful %, helpful / not helpful / no feedback, not helpful -> continued / escalated / no choice, rated by someone other than the asker, top 5 users, not-helpful list (up to 20, escalated first).

A day = records created that day in IST. Clicks after midnight still count on the day the question was asked.

Risks: the Outlook connection belongs to another team (bizapps); if it is changed or revoked the digest stops. The Groovy was not executed before upload; validate with one test run.


## 2026-11-20: last-24h window (draft v3)
Questions are counted by the user's message time (`userThreadMessageTimestamp`), feedback by `feedbackAtTs`, Continue/Escalate by `nextActionAtTs`, all within the 24 hours before the run. Clicks on questions up to 7 days old are included. Previous definition: automation.before-24h.json.
