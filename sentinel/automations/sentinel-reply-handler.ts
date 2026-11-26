import { and, appEvent, automation, eq, exists, missing, ne, op, stop, TRIGGER } from "@ua/automations";

const SLACK = "6b07126be1098f3f51e57be4";
const SENTRY = "e_6b07c410f61bef41ade9150b";
const BOT_USER = "U0CLTELV78D";

export default automation(
  {
    name: "sentinel · reply-handler",
    description: "Sentinel Flow B (replies): when a person replies in a Sentinel thread in #sentinel-finance, hands the message to the Sentry agent with the Issue context and posts its answer back in the thread. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: appEvent("slack", "slack_on_new_message", {
      triggerInputCondition: and(
        eq(TRIGGER.event.channel, "C0CKNN7U4M9"),
        exists(TRIGGER.event.thread_ts),
        missing(TRIGGER.event.bot_id),
        ne(TRIGGER.event.user, BOT_USER),
      ),
    }, { connectionId: SLACK }),
  },
  (t) => {
    // Which Issue is this thread about?
    const post = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_slack_post",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_ts", t.event.thread_ts),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    const byRoot = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_issue",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_slackRootTs", t.event.thread_ts),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    const ctx = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { event: { type: "object", title: "Event" }, post: { type: "array", title: "Post", items: { type: "object" } }, byRoot: { type: "array", title: "By Root", items: { type: "object" } } } },
      output: { type: "object", additionalProperties: false, properties: {
        ours: { type: "boolean", title: "Ours" }, issueId: { type: "string", title: "Issue Id" }, query: { type: "string", title: "Query" }, session: { type: "string", title: "Session" },
        channel: { type: "string", title: "Channel" }, threadTs: { type: "string", title: "Thread Ts" }, user: { type: "string", title: "User" }, now: { type: "integer", title: "Now" },
      }, required: ["ours", "issueId", "query", "session", "channel", "threadTs", "user", "now"] },
      parameters: { event: t, post: post.objects, byRoot: byRoot.objects },
      code: [
        "def root = (binding.hasVariable('event') && event instanceof Map) ? event : [:]",
        "def ev = (root.event instanceof Map) ? root.event : root",
        "def P = (binding.hasVariable('post') && post instanceof List && post && post[0] instanceof Map) ? (post[0].properties ?: [:]) : [:]",
        "def issueId = (P.issueId ?: '').toString()",
        "if (!issueId && binding.hasVariable('byRoot') && byRoot instanceof List && byRoot && byRoot[0] instanceof Map) issueId = (byRoot[0].id ?: '').toString()",
        "def threadTs = (ev.thread_ts ?: '').toString()",
        "def user = (ev.user ?: '').toString()",
        "def text = (ev.text ?: '').toString().take(2000)",
        "def q = '[Sentinel issue ' + issueId + ' | thread ' + threadTs + ' | from <@' + user + '>] ' + text",
        "return [ours: issueId.length() > 0, issueId: issueId, query: q, session: 'sentinel-' + threadTs, channel: (ev.channel ?: 'C0CKNN7U4M9').toString(), threadTs: threadTs, user: user, now: System.currentTimeMillis()]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    if (eq(ctx.result.ours, true)) {
      // Ask Sentry
      const ans = op("ai_agents_by_unifyapps", "ai_agents_by_unifyapps_invoke_agent", {
        parameters: {
          aiAgentId: SENTRY,
          userQuery: ctx.result.query,
          sessionId: ctx.result.session,
          skipApprovalBeforeToolExecution: true,
        },
      });
      // Keep the final answer (the runtime also emits "Executing the tool ..." status lines)
      const last = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
        input: { type: "object", properties: { responses: { type: "array", title: "Responses", items: { type: "object" } } } },
        output: { type: "object", additionalProperties: false, properties: { text: { type: "string", title: "Text" } }, required: ["text"] },
        parameters: { responses: ans.agentResponses },
        code: [
          "def R = (binding.hasVariable('responses') && responses instanceof List) ? responses : []",
          "def texts = R.collect { (it instanceof Map && it.text != null) ? it.text.toString() : '' }.findAll { it }",
          "def real = texts.findAll { !(it =~ /^Executing the tool /) }",
          "return [text: (real ? real[-1] : (texts ? texts[-1] : 'Sentry gave no answer.')).take(3000)]",
        ].join("\n"),
        compile_static: false, captureStdOutput: false,
      });
      // Reply in the thread
      const reply = op("slack", "slack_post_message_in_channel", {
        channel: ctx.result.channel, messageType: "text", thread_ts: ctx.result.threadTs,
        text: last.result.text,
      }, { connectionId: SLACK });
      op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
        object_type: "sentinel_slack_post",
        record: { channelId: ctx.result.channel, ts: reply.ts, threadTs: ctx.result.threadTs, kind: "answer", issueId: ctx.result.issueId, postedBy: "agent", postedAt: ctx.result.now, text: last.result.text },
      }, { onError: "CONTINUE" });
    }
    stop();
  },
);
