import { appEvent, automation, branch, contains, endsWith, eq, op, or, stop } from "@ua/automations";

const SLACK = "6b07126be1098f3f51e57be4";
const RECORD_ANSWER = "6b07c39977940a619451d4da";

export default automation(
  {
    name: "sentinel · button-handler",
    description: "Sentinel Flow B (buttons). A click on a Sentinel post reaches this automation because the button's action_id is <this automation id>_<n>. One branch per button: records the decision through tool-record-answer, replies in the thread with what happened next, and marks the post with a reaction. Buttons: 1 Expected, 2 Known/tracked, 3 Being worked on, 4 Needs devs, 5 Fixed, 6 Not sure. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: appEvent("slack", "slack_on_button_click", {}, { connectionId: SLACK }),
  },
  (t) => {
    // Which Issue does the clicked message belong to?
    const post = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_slack_post",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_ts", t.message.ts),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    // Common context for every branch
    const m = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { event: { type: "object", title: "Event" }, post: { type: "array", title: "Post", items: { type: "object" } } } },
      output: { type: "object", additionalProperties: false, properties: {
        issueId: { type: "string", title: "Issue Id" }, actor: { type: "string", title: "Actor" }, actorName: { type: "string", title: "Actor Name" },
        channel: { type: "string", title: "Channel" }, threadTs: { type: "string", title: "Thread Ts" }, rootTs: { type: "string", title: "Root Ts" },
        ok: { type: "boolean", title: "Ok" }, now: { type: "integer", title: "Now" }, clickTs: { type: "string", title: "Click Ts" }, label: { type: "string", title: "Label" },
      }, required: ["issueId", "actor", "actorName", "channel", "threadTs", "rootTs", "ok", "now", "clickTs", "label"] },
      parameters: { event: t, post: post.objects },
      code: [
        "def ev = (binding.hasVariable('event') && event instanceof Map) ? event : [:]",
        "def acts = (ev.actions instanceof List) ? ev.actions : []",
        "def a0 = (acts && acts[0] instanceof Map) ? acts[0] : [:]",
        "def valueId = (a0.value ?: '').toString()",
        "def label = ((a0.text instanceof Map) ? (a0.text.text ?: '') : '').toString()",
        "def P = (binding.hasVariable('post') && post instanceof List && post && post[0] instanceof Map) ? (post[0].properties ?: [:]) : [:]",
        "def issueId = (P.issueId ?: valueId ?: '').toString()",
        "def cont = (ev.container instanceof Map) ? ev.container : [:]",
        "def msgTs = (ev.message instanceof Map && ev.message.ts) ? ev.message.ts.toString() : (cont.message_ts ?: '').toString()",
        "def threadTs = (cont.thread_ts ?: msgTs ?: '').toString()",
        "def rootTs = (P.threadTs ?: threadTs).toString()",
        "def channel = (ev.channel instanceof Map && ev.channel.id) ? ev.channel.id.toString() : ((cont.channel_id ?: 'C0CKNN7U4M9').toString())",
        "def u = (ev.user instanceof Map) ? ev.user : [:]",
        "return [issueId: issueId, actor: (u.id ?: '').toString(), actorName: (u.name ?: u.username ?: '').toString(), channel: channel, threadTs: threadTs, rootTs: rootTs, ok: issueId.length() > 0, now: System.currentTimeMillis(), clickTs: 'click-' + ((a0.action_ts ?: System.currentTimeMillis()).toString()), label: label]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    if (eq(m.result.ok, true)) {
      branch([
        {
          name: "1 Expected",
          when: or(endsWith(t.actions[0].action_id, "_1"), contains(t.actions[0].text.text, "Expected")),
          then: () => {
            // Record: Issue → suppressed (expected), Known Issue row, Decision Log; counters reset
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "expected", reason: `button Expected by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            // Tell the thread what changes from now on
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> marked this *expected*. ${rec.recorded} I will stay silent on this failure; reply here with a reason if you want it on record, or say "not expected" later to undo.` }, { connectionId: SLACK });
            // ✔️ on the post: closed as expected
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "check" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
        {
          name: "2 Known tracked",
          when: or(endsWith(t.actions[0].action_id, "_2"), contains(t.actions[0].text.text, "Known")),
          then: () => {
            // Record: Issue → tracked, Known Issue row; counters reset
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "known", reason: `button Known by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            // Ask for the link so the Issue can be tied to the task
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> marked this *known and tracked*. ${rec.recorded} Reply in this thread with the Atlas task link and I will attach it; without one I will ask again in 24 hours.` }, { connectionId: SLACK });
            // 👀 on the post: being watched by someone
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "eyes" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
        {
          name: "3 Being worked on",
          when: or(endsWith(t.actions[0].action_id, "_3"), contains(t.actions[0].text.text, "worked on")),
          then: () => {
            // Record: Issue → suppressed until a date (3 days if none given), Known Issue row (working); counters reset
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "working", reason: `button Being worked on by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> marked this *being worked on*. ${rec.recorded} Reply with the date it should be fixed by (yyyy-mm-dd) to change that; if it still fails after the date I will come back here with the history.` }, { connectionId: SLACK });
            // 🚀 on the post: in progress
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "rocket" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
        {
          name: "4 Needs devs",
          when: or(endsWith(t.actions[0].action_id, "_4"), contains(t.actions[0].text.text, "Needs devs")),
          then: () => {
            // Record: Issue → tracked, escalation level L1, counters reset
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "needs_devs", reason: `button Needs devs by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> marked this *needs devs*. ${rec.recorded} Reply with the Atlas task link once it exists and I will attach it; I will keep counting failures and come back if nothing moves.` }, { connectionId: SLACK });
            // 🔥 on the post: real defect
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "fire" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
        {
          name: "5 Fixed",
          when: or(endsWith(t.actions[0].action_id, "_5"), contains(t.actions[0].text.text, "Fixed")),
          then: () => {
            // Record: Issue → resolved; the grouper reopens it if the same fingerprint returns
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "fixed", reason: `button Fixed by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> marked this *fixed*. ${rec.recorded}` }, { connectionId: SLACK });
            // 🎉 on the post: resolved
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "tada" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
        {
          name: "6 Not sure",
          when: or(endsWith(t.actions[0].action_id, "_6"), contains(t.actions[0].text.text, "Not sure")),
          then: () => {
            // Record only: Issue stays triaging, Decision Log notes who was unsure
            const rec = op("callables", "callables_call_automation", { automationId: RECORD_ANSWER, version: "-1", synchronous: true,
              parameters: { issueId: m.result.issueId, answer: "not_sure", reason: `button Not sure by ${m.result.actorName}`, actorSlackId: m.result.actor, source: "button" } });
            // Ask the group so someone else can pick it up
            op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
              text: `<@${m.result.actor}> is not sure about this one. ${rec.recorded} <!subteam^S0B23CF34HK> can someone else say whether this is expected, tracked, being worked on, or needs devs?` }, { connectionId: SLACK });
            // 🤔 on the post: still open
            op("slack", "slack_reactions_add", { channel: m.result.channel, timestamp: m.result.rootTs, name: "thinking_face" }, { connectionId: SLACK, onError: "CONTINUE" });
          },
        },
      ], () => {
        // Unknown button: say so, change nothing
        op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
          text: `<@${m.result.actor}> I got a click on "${m.result.label}" but do not know what it means; nothing was changed.` }, { connectionId: SLACK, onError: "CONTINUE" });
      });

      // Remember the click as a Slack event on this Issue
      op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
        object_type: "sentinel_slack_post",
        record: { channelId: m.result.channel, ts: m.result.clickTs, threadTs: m.result.threadTs, kind: "answer", issueId: m.result.issueId, postedBy: "handler", postedAt: m.result.now, text: `button: ${m.result.label} by ${m.result.actorName}` },
      }, { onError: "CONTINUE" });
    } else {
      // Not one of our posts (no Issue behind it): tell the clicker, change nothing
      op("slack", "slack_post_message_in_channel", { channel: m.result.channel, messageType: "text", thread_ts: m.result.threadTs,
        text: `<@${m.result.actor}> this message is not linked to a Sentinel Issue, so the click changed nothing.` }, { connectionId: SLACK, onError: "CONTINUE" });
    }
    stop();
  },
);
