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

## Deployed 24 Nov
- MF3 live v3 = draft v14 (as designed).
- MF4 was deployed as v11 by someone else with the escalation post moved to channel C0CK9AW8X9C, while the transcript thread reply still pointed at C0CLEPPCP8T (reply would fail silently). Fixed: thread reply uses the same channel. Draft v17, live v12. Both posts now go to C0CK9AW8X9C; to switch channels, change n_post01 and n_post02 together.

## 24 Nov: conversation as thread replies (MF4 draft v19, NOT deployed; live is v12)
Each user question / agent answer becomes its own thread reply via a for-each loop; answers over ~3,800 chars are split at line breaks with code blocks closed and reopened, so tables render whole. Internal agent messages (THOUGHT, AGENT_INTERNAL_RESPONSE, temporary) are skipped by marker; Markdown **bold** is converted to Slack *bold*. Pre-change definition: MF4.v17-before-chunking.json.

## v21 draft: Markdown tables (2026-11-24)
Slack cannot render Markdown pipe tables (`| Field | Details |`), so answers that used them showed raw pipes in the
escalation thread. The transcript step now turns each pipe table into an aligned code block (separator row and `*bold*`
in cells removed), turns `### Heading` into `*Heading*`, and drops `---` lines. Existing ``` blocks are left as they are.
Live before this change: deployed v14 (= draft v19), saved as `MF4.v19-live-before-tablefix.json`.
