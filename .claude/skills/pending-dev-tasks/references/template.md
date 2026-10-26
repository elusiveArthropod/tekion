# Template: Tekion - Pending Dev Tasks

Slack mrkdwn. `<url|label>` is a Slack link. Replace `@here` with nothing in a DM draft.

```
@here
*`Tekion - Pending Dev Tasks`* _(from the In Dev board, <D Mon>)_

*Infra / DevOps* _*`(N)`*_
1. `DevOps` | <Title> - <https://atlas.unifyapps.com/issue/TEK-nnn/details|ticket> - _<state line> - <Owner 1>, <Owner 2> - <https://unifyapps.slack.com/archives/C0A1EPNSLJ1/p<ts>|thread> - *ETA - TBD* - *raised on 6th Oct*_ _[open 17d]_
2. ...

*BE* _*`(N)`*_
1. `BE` | :risk: <Title> - <ticket> - _<state line> - <owners> - <thread> - *[ETA Breached]* - *ETA - TBD* - *raised on 30th Sep*_ _[open 23d]_

*Connector* _*`(N)`*_
...

*UI* _*`(N)`*_
...

*UI + BE* _*`(N)`*_
...

_+ Sumeet Nandal sir, Rachit Mittal sir, Shivam Satrawal sir, Abhishek Khurana sir, <!subteam^S0B23CF34HK>, Vinod Ramanathan sir_
```

## Filled example (from the 23 Oct 2026 run)

```
9. `BE` | :risk: Prod | Load Case automation OutOfMemoryError at session variable node (AI-1348) - <https://atlas.unifyapps.com/issue/TEK-492/details|ticket> - _Dev Review; PRs 50696 and 50723 raised 3 Oct, not merged even to main as of 9 Oct; prod still exposed - Yash Patel - <https://unifyapps.slack.com/archives/C0A1EPNSLJ1/p1790751086520059|thread> - *ETA - TBD* - *raised on 30th Sep*_ _[open 23d]_
```

## Element rules

| Element | Rule |
|---|---|
| `` `Cat` `` | Dev Category label: `Infra`, `DevOps`, `BE`, `Connector`, `UI`, `UI + BE`, `Product`, `Config`. Original posts also used `` `Tekion DevOps` `` when the next step was the client's DevOps team. |
| `:risk:` | Client-raised production issue, security item, or anything the client called critical. |
| Title | Short, in the board's `Area \| Env \| Symptom` style. Rewrite weak ticket titles here; mention in chat that the ticket title needs fixing. Add the other-board key in brackets (AI-1348, EB-4209, TTS-2507, SEV-203) when one exists. |
| state line | Who owes what, with the date of the last decisive message. Status name alone only as a fallback. |
| owners | Ticket assignees. Plain names in the DM draft; `<@Uxxxx>` mentions in the channel post. |
| thread | Earliest originating Slack thread. Sub-issues use the parent thread with "(item n)". `_no Slack thread_` if none exists. |
| ETA | `dueDate` on the ticket, else `TBD`. Past due or missed client promise: prefix `*[ETA Breached]*`. |
| raised on | Date of the earliest linked Slack thread, ordinal day plus short month. |
| `[open Nd]` | Days since raised-on. Omit when raised today. |
| footer | Leadership tags as above; `S0B23CF34HK` is the leadership subteam. |

## Mention ids used in the footer and owners

See `../../tekion-board-sync/references/ids.md` for the full table. Footer people: Sumeet Nandal `U067XV8BWEL`, Rachit Mittal `U06BSBSFR54`, Shivam Satrawal `U06FSNM2P40`, Abhishek Khurana `U06CQQ3NPDE`, Vinod Ramanathan `U0AR640NLQ4`.
