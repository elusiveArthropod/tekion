# ODYSSEY intake: discovery questions

Ask only the ones the evidence did not already answer. Group them, number them, say why each matters, and mark which block the design. One message.

## Always

1. **The pain**: what happens today, who feels it, how often, what did it cost the last time it went wrong (an escalation, a missed SLA, hours of someone's week)?
2. **The goal**: what should be true when this is done? Phrase it as something observable ("no failed automation goes unanswered for more than X", not "better monitoring").
3. **Success criteria**: how will we know in a month that it worked? What number moves?
4. **Scope**: which environment, team, system, time window first? What is explicitly out for v1?
5. **Who**: the people and teams involved, their roles, and the Slack / email handles or group ids. Who decides, who gets asked, who gets escalated to.
6. **Existing attempts**: what exists already (automations, dashboards, channels, sheets)? What is good about it, what failed?
7. **Constraints**: platform limits, load, cost, security rules, access I will and will not have, deadlines.
8. **Sources of truth**: where is the data, where are tickets tracked, where are decisions recorded today? Which of those can I read, which can I write?

## For a monitoring / alerting / agent problem

9. What is the unit of work (an alert, an issue, a ticket)? What makes two events "the same problem"?
10. What does "expected" or "known" mean, and where is that knowledge today (usually in people's heads)?
11. Who answers questions about a failure, how fast, and what happens when they do not answer?
12. What must never happen (a false "ignore", a missed escalation, a flood)?
13. What volume should I expect, and what is the worst day?
14. How do we know the monitor itself is alive?

## For an integration / automation problem

9. The trigger: event or schedule? Real-time needed, or is N minutes fine?
10. The payload: do we have a real sample, not just the documented schema?
11. Idempotency: what happens if the same event arrives twice?
12. Failure handling: retry, dead-letter, who is told?
13. Rate limits, quotas and credentials: whose, how long do they live, who rotates them?

## For a data / reporting problem

9. Who reads the output and what decision do they make from it?
10. Freshness needed, and the cost of being stale.
11. Definitions: the one metric everyone argues about; pin it down now.
12. Where the data is wrong today and how we will know when it is right.

## Access checklist to ask for before building

- Platform / API access as a service identity, not a person's browser session.
- The target channels or destinations, created, with the bot added, ids in hand.
- Tracker access (read, and write if the design needs it), with the field names that matter.
- Any webhook or app configuration that must point at us (event subscriptions, interactivity URLs).
- A safe way to generate test events on demand.
