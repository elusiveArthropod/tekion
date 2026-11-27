import { automation, eq, exists, op, schedule, stop } from "@ua/automations";

const SLACK = "6b07126be1098f3f51e57be4";

export default automation(
  {
    name: "sentinel · poster",
    description: "Sentinel Flow F: the only writer to Slack. Every 2 minutes posts Issues flagged needsPost to #sentinel-finance: one thread per Issue, thread replies for repeats, a new top-level post for escalations and reopens. Tag: alert-monitoring.",
    settings: { enableNodeLevelLogging: true, enableRunLogging: true, enableVariableLogging: true },
    trigger: schedule({ cron: "INTERVAL", interval: 2, frequency: "MINUTES", sequential: true, maxWaitTime: 30, sequentialRunTimeUnit: "MINUTES" }),
  },
  () => {
    // Config
    const cfg = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_config",
      numberOfRecordsToFetch: "MULTIPLE",
      page: { paginateBy: "OFFSET", limit: 100, offset: 0 },
    });

    // Issues waiting for a post
    const pending = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_issue",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_needsPost", true),
      sortBy: [{ field: "properties_lastSeen", order: "DESC" }],
      page: { paginateBy: "OFFSET", limit: 15, offset: 0 },
    });

    for (const issue of pending.objects) {
      // Automation name and owner from the registry
      const reg = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
        object_type: "sentinel_workflow_registry",
        numberOfRecordsToFetch: "MULTIPLE",
        triggerInputCondition: eq("properties_automationId", issue.properties.automationId),
        page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
      });

      // Compose the message
      const msg = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
        input: {
          type: "object",
          properties: {
            cfg: { type: "array", title: "Config", items: { type: "object" } },
            issue: { type: "object", title: "Issue" },
            reg: { type: "array", title: "Registry", items: { type: "object" } },
          },
        },
        output: {
          type: "object",
          additionalProperties: false,
          properties: {
            channel: { type: "string", title: "Channel" },
            issueId: { type: "string", title: "Issue Id" },
            postKind: { type: "string", title: "Post Kind" },
            topLevel: { type: "boolean", title: "Top Level" },
            hasThread: { type: "boolean", title: "Has Thread" },
            threadTs: { type: "string", title: "Thread Ts" },
            headline: { type: "string", title: "Headline" },
            body: { type: "string", title: "Body" },
            threadNote: { type: "string", title: "Thread Note" },
            fallback: { type: "string", title: "Fallback" },
            recordKind: { type: "string", title: "Record Kind" },
            newState: { type: "string", title: "New State" },
            shadow: { type: "boolean", title: "Shadow" },
            now: { type: "integer", title: "Now" },
          },
          required: ["channel", "issueId", "postKind", "topLevel", "hasThread", "threadTs", "headline", "body", "threadNote", "fallback", "recordKind", "newState", "shadow", "now"],
        },
        parameters: { cfg: cfg.objects, issue: issue, reg: reg.objects },
        code: [
          "def C = [:]; ((binding.hasVariable('cfg') && cfg instanceof List) ? cfg : []).each { r -> def p = (r instanceof Map && r.properties instanceof Map) ? r.properties : [:]; if (p.key) C[p.key.toString()] = p.value?.toString() }",
          "def I = (binding.hasVariable('issue') && issue instanceof Map) ? issue : [:]",
          "def p = (I.properties instanceof Map) ? I.properties : [:]",
          "def R = (binding.hasVariable('reg') && reg instanceof List && reg && reg[0] instanceof Map && reg[0].properties instanceof Map) ? reg[0].properties : [:]",
          "def channel = C.slackChannelId ?: 'C0CKNN7U4M9'",
          "def product = C.productGroupSlackId ? ('<!subteam^' + C.productGroupSlackId + '>') : ''",
          "def fmt = { v -> try { java.time.Instant.ofEpochMilli(v as Long).atZone(java.time.ZoneId.of('Asia/Kolkata')).format(java.time.format.DateTimeFormatter.ofPattern('dd MMM HH:mm')) } catch (Exception e) { '' } }",
          "def name = (R.name ?: ('automation ' + (p.automationId ?: '?'))).toString()",
          "def ownerTxt = R.ownerSlackId ? ('<@' + R.ownerSlackId + '>') : (R.ownerName ? R.ownerName.toString() : '_no owner recorded_')",
          "def kind = (p.postKind ?: 'new').toString()",
          "def rootTs = (p.slackRootTs ?: '').toString()",
          "def hasThread = rootTs.length() > 0",
          "def topLevel = (kind == 'new') || (kind == 'escalate') || (kind == 'reopen') || !hasThread",
          "def total = (p.totalCount ?: 0), since = (p.countSinceLastAck ?: 0)",
          "def err = ((p.sampleErrorMessage ?: '') as String).replace('`', \"'\").take(400)",
          "def cls = (p.exceptionClass ?: '').toString()",
          "def link = p.lastRunUrl ? ('<' + p.lastRunUrl + '|latest run>') : ''",
          "def threadLink = hasThread ? ('<https://unifyapps.slack.com/archives/' + channel + '/p' + rootTs.replace('.', '') + '|thread>') : ''",
          "def sev = (p.severity ?: 'low').toString()",
          "def icon = kind == 'escalate' ? ':warning:' : (kind == 'reopen' ? ':rotating_light:' : ':red_circle:')",
          "def headline = kind == 'escalate' ? (icon + ' Still failing, no answer: ' + name) : (kind == 'reopen' ? (icon + ' Back after being fixed: ' + name) : (icon + ' ' + name + ' is failing'))",
          "def body = '*Error:* `' + cls + '` ' + err + '\\n*Node:* ' + (p.nodeId ?: '?') + '  ·  *Seen:* ' + total + ' time' + (total == 1 ? '' : 's') + ' since ' + fmt(p.firstSeen) + '  ·  *Severity:* ' + sev + (link ? ('  ·  ' + link) : '') + '\\n*Owner:* ' + ownerTxt",
          "if (kind == 'new') body += '\\n\\n' + product + ' is this expected? Pick one below, or reply in this thread.'",
          "if (kind == 'escalate') body += '\\n\\n' + product + ' ' + since + ' failures since the last answer' + (threadLink ? (' (' + threadLink + ')') : '') + '. Please give a fix date or mark it expected.'",
          "if (kind == 'reopen') body += '\\n\\n' + product + ' this was marked fixed and has failed again' + (threadLink ? (' (' + threadLink + ')') : '') + '.'",
          "def note = kind == 'repeat' ? ('Seen again: ' + total + ' total, ' + since + ' since the last answer. ' + link) : (kind == 'escalate' ? ('Escalated: ' + since + ' failures without an answer.') : (kind == 'reopen' ? 'Reopened: failing again after being marked fixed.' : ''))",
          "def newState = (p.state ?: 'new').toString(); if (kind == 'new' && newState in ['new','pending_agent']) newState = 'triaging'",
          "def recordKind = [new: 'issue', repeat: 'repeat', escalate: 'escalation', reopen: 'reopen'][kind] ?: 'note'",
          "return [channel: channel, issueId: I.id.toString(), postKind: kind, topLevel: topLevel, hasThread: hasThread, threadTs: rootTs, headline: headline, body: body, threadNote: note, fallback: headline, recordKind: recordKind, newState: newState, shadow: (C.shadowMode ?: 'false') == 'true', now: System.currentTimeMillis()]",
        ].join("\n"),
        compile_static: false,
        captureStdOutput: false,
      });

      if (eq(msg.result.shadow, false)) {
        if (eq(msg.result.topLevel, true)) {
          // New top-level post with answer buttons
          const posted = op("slack", "slack_post_message_custom_block_kit", {
            channel: msg.result.channel,
            text: msg.result.fallback,
            blockInputType: "blockList",
            blocks: [
              { type: "header", text: { type: "plain_text", text: msg.result.headline, emoji: true } },
              { type: "section", text: { type: "mrkdwn", text: msg.result.body } },
              { type: "actions", block_id: "sentinel_answer", elements: [
                { type: "button", text: { type: "plain_text", text: "Expected", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_1", value: msg.result.issueId },
                { type: "button", text: { type: "plain_text", text: "Known · tracked", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_2", value: msg.result.issueId },
                { type: "button", text: { type: "plain_text", text: "Being worked on", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_3", value: msg.result.issueId },
                { type: "button", text: { type: "plain_text", text: "Needs devs", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_4", value: msg.result.issueId, style: "primary" },
                { type: "button", text: { type: "plain_text", text: "Fixed", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_5", value: msg.result.issueId },
                { type: "button", text: { type: "plain_text", text: "Not sure", emoji: true }, action_id: "6b07c40fe61cdd44b6fbaf40_6", value: msg.result.issueId },
              ] },
            ],
          }, { connectionId: SLACK });

          // Record the post
          op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
            object_type: "sentinel_slack_post",
            record: { channelId: msg.result.channel, ts: posted.ts, threadTs: posted.ts, kind: msg.result.recordKind, issueId: msg.result.issueId, postedBy: "poster", postedAt: msg.result.now, text: msg.result.headline },
          }, { onError: "CONTINUE" });

          if (eq(msg.result.hasThread, false)) {
            // First post for this Issue: remember the thread, move to triaging
            op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
              object_type: "sentinel_issue",
              recordId: msg.result.issueId,
              updateFields: [
                { fieldName: "properties.slackChannelId", actionType: "SET", setValue: msg.result.channel },
                { fieldName: "properties.slackRootTs", actionType: "SET", setValue: posted.ts },
                { fieldName: "properties.state", actionType: "SET", setValue: msg.result.newState },
                { fieldName: "properties.needsPost", actionType: "SET", setValue: "false" },
                { fieldName: "properties.postKind", actionType: "SET", setValue: "none" },
              ],
            });
          } else {
            // Escalation or reopen: also note it in the original thread
            op("slack", "slack_post_message_in_channel", {
              channel: msg.result.channel, messageType: "text", text: msg.result.threadNote, thread_ts: msg.result.threadTs,
            }, { connectionId: SLACK, onError: "CONTINUE" });
            op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
              object_type: "sentinel_issue",
              recordId: msg.result.issueId,
              updateFields: [
                { fieldName: "properties.needsPost", actionType: "SET", setValue: "false" },
                { fieldName: "properties.postKind", actionType: "SET", setValue: "none" },
              ],
            });
          }
        } else {
          // Repeat: thread reply only
          const reply = op("slack", "slack_post_message_in_channel", {
            channel: msg.result.channel, messageType: "text", text: msg.result.threadNote, thread_ts: msg.result.threadTs,
          }, { connectionId: SLACK });
          op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
            object_type: "sentinel_slack_post",
            record: { channelId: msg.result.channel, ts: reply.ts, threadTs: msg.result.threadTs, kind: "repeat", issueId: msg.result.issueId, postedBy: "poster", postedAt: msg.result.now, text: msg.result.threadNote },
          }, { onError: "CONTINUE" });
          op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
            object_type: "sentinel_issue",
            recordId: msg.result.issueId,
            updateFields: [
              { fieldName: "properties.needsPost", actionType: "SET", setValue: "false" },
              { fieldName: "properties.postKind", actionType: "SET", setValue: "none" },
            ],
          });
        }
      } else {
        // Shadow mode: record the decision, post nothing
        op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
          object_type: "sentinel_issue",
          recordId: msg.result.issueId,
          updateFields: [
            { fieldName: "properties.needsPost", actionType: "SET", setValue: "false" },
            { fieldName: "properties.postKind", actionType: "SET", setValue: "none" },
          ],
        });
      }
    }

    stop();
  },
);
