import { appEvent, automation, eq, op, stop } from "@ua/automations";

const SLACK = "6b07126be1098f3f51e57be4";
const RECORD_ANSWER = "6b07c39977940a619451d4da";

export default automation(
  {
    name: "sentinel · button-handler",
    description: "Sentinel Flow B (buttons): when someone clicks an answer button on a Sentinel post in #sentinel-finance, records the answer through tool-record-answer and confirms in the thread. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: appEvent("slack", "slack_on_button_click", {}, { connectionId: SLACK }),
  },
  (t) => {
    // Which Issue does this message belong to?
    const post = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_slack_post",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_ts", t.message.ts),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    // Map the button to an answer
    const m = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { event: { type: "object", title: "Event" }, post: { type: "array", title: "Post", items: { type: "object" } } } },
      output: { type: "object", additionalProperties: false, properties: {
        issueId: { type: "string", title: "Issue Id" }, answer: { type: "string", title: "Answer" }, actor: { type: "string", title: "Actor" }, actorName: { type: "string", title: "Actor Name" },
        channel: { type: "string", title: "Channel" }, threadTs: { type: "string", title: "Thread Ts" }, ok: { type: "boolean", title: "Ok" }, needsDetail: { type: "boolean", title: "Needs Detail" }, prompt: { type: "string", title: "Prompt" }, now: { type: "integer", title: "Now" },
      }, required: ["issueId", "answer", "actor", "actorName", "channel", "threadTs", "ok", "needsDetail", "prompt", "now"] },
      parameters: { event: t, post: post.objects },
      code: [
        "def ev = (binding.hasVariable('event') && event instanceof Map) ? event : [:]",
        "def acts = (ev.actions instanceof List) ? ev.actions : []",
        "def a0 = (acts && acts[0] instanceof Map) ? acts[0] : [:]",
        "def actionId = (a0.action_id ?: '').toString()",
        "def valueId = (a0.value ?: '').toString()",
        "def P = (binding.hasVariable('post') && post instanceof List && post && post[0] instanceof Map) ? (post[0].properties ?: [:]) : [:]",
        "def issueId = (P.issueId ?: valueId ?: '').toString()",
        "def cont = (ev.container instanceof Map) ? ev.container : [:]",
        "def msgTs = (ev.message instanceof Map && ev.message.ts) ? ev.message.ts.toString() : (cont.message_ts ?: '').toString()",
        "def threadTs = (cont.thread_ts ?: msgTs ?: '').toString()",
        "def channel = (ev.channel instanceof Map && ev.channel.id) ? ev.channel.id.toString() : ((cont.channel_id ?: 'C0CKNN7U4M9').toString())",
        "// action_id is <handler automation id>_<n>: the platform routes the click to this automation by that prefix; n says which button",
        "def byIndex = ['1': 'expected', '2': 'known', '3': 'working', '4': 'needs_devs', '5': 'fixed', '6': 'not_sure']",
        "def mm = (actionId =~ /_(\\d+)$/); def answer = mm.find() ? (byIndex[mm.group(1)] ?: '') : ''",
        "def label = ((a0.text instanceof Map) ? (a0.text.text ?: '') : '').toString().toLowerCase()",
        "if (!answer) { if (label.contains('expected')) answer = 'expected' else if (label.contains('known')) answer = 'known' else if (label.contains('worked') || label.contains('working')) answer = 'working' else if (label.contains('dev')) answer = 'needs_devs' else if (label.contains('fixed')) answer = 'fixed' else if (label.contains('not sure')) answer = 'not_sure' }",
        "def u = (ev.user instanceof Map) ? ev.user : [:]",
        "def needsDetail = answer in ['known', 'working']",
        "def prompt = answer == 'known' ? 'Recorded as known. Reply in this thread with the Atlas link so I can attach it.' : (answer == 'working' ? 'Recorded as being worked on. Reply with the date it should be fixed by (yyyy-mm-dd); until then I stay silent (3 days if no date).' : '')",
        "return [issueId: issueId, answer: answer, actor: (u.id ?: '').toString(), actorName: (u.name ?: u.username ?: '').toString(), channel: channel, threadTs: threadTs, ok: (issueId && answer) as boolean, needsDetail: needsDetail, prompt: prompt, now: System.currentTimeMillis()]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    if (eq(m.result.ok, true)) {
      // Record the answer
      const rec = op("callables", "callables_call_automation", {
        automationId: RECORD_ANSWER,
        version: "-1",
        synchronous: true,
        parameters: { issueId: m.result.issueId, answer: m.result.answer, reason: `button by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" },
      });
      // Confirm in the thread
      const reply = op("slack", "slack_post_message_in_channel", {
        channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
        text: `<@${m.result.actor}> ${rec.recorded} ${m.result.prompt}`,
      }, { connectionId: SLACK });
      op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
        object_type: "sentinel_slack_post",
        record: { channelId: m.result.channel, ts: reply.ts, threadTs: m.result.threadTs, kind: "answer", issueId: m.result.issueId, postedBy: "handler", postedAt: m.result.now, text: rec.recorded },
      }, { onError: "CONTINUE" });
      op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.threadTs, name: "white_check_mark" }, { connectionId: SLACK, onError: "CONTINUE" });
    }
    stop();
  },
);
