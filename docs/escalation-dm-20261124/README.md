# Escalation flow for the DM (agent/app) version of P2P Genie (24 Nov 2026)

In a DM, pinning the thread and tagging Finance no longer reaches them, so escalations are posted to Slack channel C0CLEPPCP8T with the full conversation.

- MF3 (`6aeb1c20da2c243f0fa4d1cc`) draft v14: the MF4 call also passes caseId, slackUserId, askerName, askerEmail, userQuery (from the feedback record) and escalatedBy (the clicker).
- MF4 (`6aeb204c7b6dbf46afa0e44a`) draft v14:
  1. ⁉️ reaction on the user's DM thread (unchanged)
  2. fetch the case's messages from service_hub_message (oldest first)
  3. Groovy (`context.groovy`): escalation text + transcript (progress lines removed, newest kept within ~11k chars)
  4. post to C0CLEPPCP8T tagging U08N4N85J6P and U0AG6TNMF3N, with asker and question
  5. post the transcript as a thread reply under it
  6. one confirmation to the user in the DM
  The first DM message and the pin step are skipped (kept in the definition for rollback).

Before: MF3.before.json, MF4.before.json. Deploy MF4 first, then MF3. The P2P_2 Slack app must be a member of C0CLEPPCP8T.
