import { automation, callable, eq, op } from "@ua/automations";

export default automation(
  {
    name: "sentinel · tool-record-answer",
    description: "Sentry agent tool: records a human's answer about a Sentinel Issue and applies it: expected, known (tracked in Atlas), working (with a date), needs_devs, fixed, not_sure, or owner. Writes Issue state, Known Issue, Decision Log and registry owner. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: callable({
      setup: {
        type: "object",
        properties: {
          issueId: { type: "string", title: "Issue Id", description: "Sentinel Issue record id (e_...)." },
          answer: { type: "string", title: "Answer", description: "One of: expected, known, working, needs_devs, fixed, not_sure, owner" },
          reason: { type: "string", title: "Reason", description: "The human's words, short." },
          atlasLink: { type: "string", title: "Atlas Link", description: "Atlas task URL or id when the answer is known or needs_devs." },
          etaDate: { type: "string", title: "ETA Date", description: "yyyy-MM-dd when the answer is working. Optional." },
          ownerSlackId: { type: "string", title: "Owner Slack Id", description: "Slack user id (U...) when the answer is owner, or to set the owner alongside another answer." },
          actorSlackId: { type: "string", title: "Actor Slack Id", description: "Slack user id of the person who answered." },
          source: { type: "string", title: "Source", description: "thread or button" },
        },
        required: ["issueId", "answer"],
      },
      result: {
        type: "object",
        properties: {
          ok: { type: "boolean", title: "Ok" },
          recorded: { type: "string", title: "Recorded" },
          newState: { type: "string", title: "New State" },
        },
      },
    }),
  },
  (t) => {
    const issue = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_issue",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("id", t.issueId),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    // Work out what the answer means
    const plan = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: {
        issue: { type: "array", title: "Issue", items: { type: "object" } }, answer: { type: "string", title: "Answer" }, reason: { type: "string", title: "Reason" },
        atlasLink: { type: "string", title: "Atlas Link" }, etaDate: { type: "string", title: "ETA Date" }, ownerSlackId: { type: "string", title: "Owner Slack Id" },
        actorSlackId: { type: "string", title: "Actor Slack Id" }, source: { type: "string", title: "Source" },
      } },
      output: { type: "object", additionalProperties: false, properties: {
        ok: { type: "boolean", title: "Ok" }, recorded: { type: "string", title: "Recorded" }, issueId: { type: "string", title: "Issue Id" }, fingerprint: { type: "string", title: "Fingerprint" }, automationId: { type: "string", title: "Automation Id" },
        newState: { type: "string", title: "New State" }, suppressionType: { type: "string", title: "Suppression Type" }, suppressedUntil: { type: "integer", title: "Suppressed Until" },
        knownType: { type: "string", title: "Known Type" }, writeKnown: { type: "boolean", title: "Write Known" }, setOwner: { type: "boolean", title: "Set Owner" }, ownerSlackId: { type: "string", title: "Owner Slack Id" },
        escalationLevel: { type: "string", title: "Escalation Level" }, resetCount: { type: "boolean", title: "Reset Count" }, reason: { type: "string", title: "Reason" }, atlasLink: { type: "string", title: "Atlas Link" },
        actor: { type: "string", title: "Actor" }, src: { type: "string", title: "Src" }, now: { type: "integer", title: "Now" }, payload: { type: "string", title: "Payload" }, answerKey: { type: "string", title: "Answer Key" },
      }, required: ["ok", "recorded", "issueId", "fingerprint", "automationId", "newState", "suppressionType", "suppressedUntil", "knownType", "writeKnown", "setOwner", "ownerSlackId", "escalationLevel", "resetCount", "reason", "atlasLink", "actor", "src", "now", "payload", "answerKey"] },
      parameters: { issue: issue.objects, answer: t.answer, reason: t.reason, atlasLink: t.atlasLink, etaDate: t.etaDate, ownerSlackId: t.ownerSlackId, actorSlackId: t.actorSlackId, source: t.source },
      code: [
        "import groovy.json.JsonOutput",
        "def v = { n -> binding.hasVariable(n) && binding.getVariable(n) != null ? binding.getVariable(n).toString().trim() : '' }",
        "def I = (binding.hasVariable('issue') && issue instanceof List && issue && issue[0] instanceof Map) ? issue[0] : null",
        "def now = System.currentTimeMillis()",
        "def a = v('answer').toLowerCase().replace(' ', '_').replace('-', '_')",
        "def aliases = [expected: 'expected', known: 'known', tracked: 'known', working: 'working', being_worked_on: 'working', in_progress: 'working', needs_devs: 'needs_devs', needs_dev: 'needs_devs', dev: 'needs_devs', fixed: 'fixed', resolved: 'fixed', not_sure: 'not_sure', unsure: 'not_sure', owner: 'owner']",
        "def key = aliases[a] ?: ''",
        "def base = [ok: false, recorded: '', issueId: '', fingerprint: '', automationId: '', newState: '', suppressionType: '', suppressedUntil: 0L, knownType: '', writeKnown: false, setOwner: false, ownerSlackId: v('ownerSlackId'), escalationLevel: '', resetCount: false, reason: v('reason').take(1000), atlasLink: v('atlasLink'), actor: v('actorSlackId'), src: (v('source') in ['thread','button','tool']) ? v('source') : 'tool', now: now, payload: '', answerKey: key]",
        "if (!I) { base.recorded = 'No Sentinel Issue found with id ' + v('issueId') + '.'; return base }",
        "if (!key) { base.recorded = 'Unknown answer \"' + v('answer') + '\". Use one of: expected, known, working, needs_devs, fixed, not_sure, owner.'; base.issueId = I.id.toString(); return base }",
        "def p = I.properties ?: [:]",
        "base.issueId = I.id.toString(); base.fingerprint = (p.fingerprint ?: '').toString(); base.automationId = (p.automationId ?: '').toString(); base.escalationLevel = (p.escalationLevel ?: 'L0').toString()",
        "def until = 0L; def etaTxt = v('etaDate')",
        "if (key == 'working') { try { until = etaTxt ? java.time.LocalDate.parse(etaTxt.take(10)).atStartOfDay(java.time.ZoneId.of('Asia/Kolkata')).plusDays(1).toInstant().toEpochMilli() : 0L } catch (Exception e) { until = 0L }; if (!until) until = now + 3L*24*3600*1000 }",
        "switch (key) {",
        "  case 'expected': base.newState = 'suppressed'; base.suppressionType = 'expected'; base.suppressedUntil = 0L; base.knownType = 'expected'; base.writeKnown = true; base.resetCount = true; base.escalationLevel = 'L4'; base.recorded = 'Recorded as expected. This failure stays silent from now on' + (base.reason ? (' (reason: ' + base.reason + ')') : '') + '. Say \"not expected\" later to undo.'; break",
        "  case 'known': base.newState = 'tracked'; base.knownType = 'known'; base.writeKnown = true; base.resetCount = true; base.escalationLevel = 'L4'; base.recorded = 'Recorded as known and tracked' + (base.atlasLink ? (' in ' + base.atlasLink) : ' (no Atlas link given; I will ask for one later)') + '.'; break",
        "  case 'working': base.newState = 'suppressed'; base.suppressionType = 'eta'; base.suppressedUntil = until; base.knownType = 'working'; base.writeKnown = true; base.resetCount = true; base.escalationLevel = 'L4'; base.recorded = 'Recorded as being worked on. Silent until ' + java.time.Instant.ofEpochMilli(until).atZone(java.time.ZoneId.of('Asia/Kolkata')).toLocalDate().toString() + (etaTxt ? '' : ' (no date given, so 3 days)') + '; if it still fails after that I will come back with the history.'; break",
        "  case 'needs_devs': base.newState = 'tracked'; base.resetCount = true; base.escalationLevel = 'L1'; base.recorded = 'Recorded as needing devs' + (base.atlasLink ? (', tracked in ' + base.atlasLink) : '. No Atlas task yet: share the link when it exists') + '.'; break",
        "  case 'fixed': base.newState = 'resolved'; base.resetCount = true; base.escalationLevel = 'L0'; base.recorded = 'Recorded as fixed. If the same failure comes back I will reopen it.'; break",
        "  case 'not_sure': base.newState = (p.state ?: 'triaging').toString(); base.resetCount = false; base.recorded = 'Noted. I will keep the question open and tag the manager if it keeps failing.'; break",
        "  case 'owner': base.newState = (p.state ?: 'triaging').toString(); base.setOwner = base.ownerSlackId.length() > 0; base.recorded = base.setOwner ? ('Recorded <@' + base.ownerSlackId + '> as the owner of this automation.') : 'No Slack user id given for the owner; nothing changed.'; break",
        "}",
        "if (key != 'owner' && base.ownerSlackId) base.setOwner = true",
        "base.ok = true",
        "base.payload = JsonOutput.toJson([answer: key, reason: base.reason, atlasLink: base.atlasLink, etaDate: etaTxt, ownerSlackId: base.ownerSlackId, previousState: p.state, newState: base.newState])",
        "return base",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    if (eq(plan.result.ok, true)) {
      // Issue
      op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
        object_type: "sentinel_issue",
        recordId: plan.result.issueId,
        updateFields: [
          { fieldName: "properties.state", actionType: "SET", setValue: plan.result.newState },
          { fieldName: "properties.suppressionType", actionType: "SET", setValue: plan.result.suppressionType },
          { fieldName: "properties.suppressedUntil", actionType: "SET", setValue: `${plan.result.suppressedUntil}` },
          { fieldName: "properties.escalationLevel", actionType: "SET", setValue: plan.result.escalationLevel },
          { fieldName: "properties.lastAckAt", actionType: "SET", setValue: `${plan.result.now}` },
          { fieldName: "properties.lastAckBy", actionType: "SET", setValue: plan.result.actor },
          { fieldName: "properties.needsPost", actionType: "SET", setValue: "false" },
          { fieldName: "properties.postKind", actionType: "SET", setValue: "none" },
        ],
      });
      if (eq(plan.result.resetCount, true)) {
        op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
          object_type: "sentinel_issue",
          recordId: plan.result.issueId,
          updateFields: [{ fieldName: "properties.countSinceLastAck", actionType: "SET", setValue: "0" }],
        });
      }
      // Known Issue
      if (eq(plan.result.writeKnown, true)) {
        op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
          object_type: "sentinel_known_issue",
          record: { fingerprint: plan.result.fingerprint, automationId: plan.result.automationId, type: plan.result.knownType, reason: plan.result.reason, atlasLink: plan.result.atlasLink, etaAt: plan.result.suppressedUntil, setBySlackId: plan.result.actor, setAt: plan.result.now, active: true },
        }, { onError: "CONTINUE" });
      }
      // Owner
      if (eq(plan.result.setOwner, true)) {
        op("storage_by_unifyapps", "storage_by_unifyapps_update_records", {
          object_type: "sentinel_workflow_registry",
          numberOfRecordsToUpdate: "MULTIPLE",
          triggerInputCondition: eq("properties_automationId", plan.result.automationId),
          updateFields: [
            { fieldName: "properties.ownerSlackId", actionType: "SET", setValue: plan.result.ownerSlackId },
            { fieldName: "properties.source", actionType: "SET", setValue: "human" },
          ],
          page: { limit: 5, offset: 0 },
        }, { onError: "CONTINUE" });
        op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
          object_type: "sentinel_issue",
          recordId: plan.result.issueId,
          updateFields: [{ fieldName: "properties.ownerSlackId", actionType: "SET", setValue: plan.result.ownerSlackId }],
        }, { onError: "CONTINUE" });
      }
      // Decision log
      op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
        object_type: "sentinel_decision_log",
        record: { issueId: plan.result.issueId, action: plan.result.answerKey, reason: plan.result.reason, decidedBy: "human", actorSlackId: plan.result.actor, source: plan.result.src, at: plan.result.now, payload: plan.result.payload },
      }, { onError: "CONTINUE" });
    }

    return { ok: plan.result.ok, recorded: plan.result.recorded, newState: plan.result.newState };
  },
);
