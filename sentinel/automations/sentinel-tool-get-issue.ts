import { automation, callable, eq, op } from "@ua/automations";

export default automation(
  {
    name: "sentinel · tool-get-issue",
    description: "Sentry agent tool: reads one Sentinel Issue by issueId or by the Slack thread ts it was posted in, with automation name, owner, counters and the latest failed runs. Read-only. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: callable({
      setup: {
        type: "object",
        properties: {
          issueId: { type: "string", title: "Issue Id", description: "Sentinel Issue record id (e_...). Give this or slackThreadTs." },
          slackThreadTs: { type: "string", title: "Slack Thread Ts", description: "The ts of the Slack thread root the question was asked in." },
        },
      },
      result: {
        type: "object",
        properties: {
          found: { type: "boolean", title: "Found" },
          issueId: { type: "string", title: "Issue Id" },
          summary: { type: "string", title: "Summary" },
          state: { type: "string", title: "State" },
          automationName: { type: "string", title: "Automation Name" },
          automationId: { type: "string", title: "Automation Id" },
          errorMessage: { type: "string", title: "Error Message" },
          totalCount: { type: "integer", title: "Total Count" },
          countSinceLastAck: { type: "integer", title: "Count Since Last Answer" },
          lastRunUrl: { type: "string", title: "Last Run URL" },
          recentRuns: { type: "string", title: "Recent Runs (JSON)" },
        },
      },
    }),
  },
  (t) => {
    // Safe lookup keys: an undefined pill in a filter fails the fetch, so default both
    const keys = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { issueId: { type: "string", title: "Issue Id" }, slackThreadTs: { type: "string", title: "Slack Thread Ts" } } },
      output: { type: "object", additionalProperties: false, properties: { idKey: { type: "string", title: "Id Key" }, tsKey: { type: "string", title: "Ts Key" } }, required: ["idKey", "tsKey"] },
      parameters: { issueId: t.issueId, slackThreadTs: t.slackThreadTs },
      code: [
        "def v = { n -> binding.hasVariable(n) && binding.getVariable(n) != null ? binding.getVariable(n).toString().trim() : '' }",
        "return [idKey: v('issueId') ?: '__none__', tsKey: v('slackThreadTs') ?: '__none__']",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });
    // Resolve the Issue id from the thread, if only the thread was given
    const post = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_slack_post",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_ts", keys.result.tsKey),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });
    const pick = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { idKey: { type: "string", title: "Id Key" }, post: { type: "array", title: "Post", items: { type: "object" } } } },
      output: { type: "object", additionalProperties: false, properties: { issueId: { type: "string", title: "Issue Id" } }, required: ["issueId"] },
      parameters: { idKey: keys.result.idKey, post: post.objects },
      code: [
        "def id = (binding.hasVariable('idKey') && idKey && idKey != '__none__') ? idKey.toString() : ''",
        "if (!id && binding.hasVariable('post') && post instanceof List && post && post[0] instanceof Map && post[0].properties instanceof Map) id = (post[0].properties.issueId ?: '').toString()",
        "return [issueId: id ?: '__none__']",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    // The Issue
    const issue = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_issue",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("id", pick.result.issueId),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });
    // Latest runs of this Issue
    const runs = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_failed_run",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_issueId", pick.result.issueId),
      sortBy: [{ field: "properties_endTime", order: "DESC" }],
      page: { paginateBy: "OFFSET", limit: 5, offset: 0 },
    });
    // Registry row
    const regs = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_workflow_registry",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_automationId", issue.objects[0].properties.automationId),
      page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
    });

    const out = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: {
        issue: { type: "array", title: "Issue", items: { type: "object" } },
        runs: { type: "array", title: "Runs", items: { type: "object" } },
        regs: { type: "array", title: "Regs", items: { type: "object" } },
      } },
      output: { type: "object", additionalProperties: false, properties: {
        found: { type: "boolean", title: "Found" }, issueId: { type: "string", title: "Issue Id" }, summary: { type: "string", title: "Summary" },
        state: { type: "string", title: "State" }, automationName: { type: "string", title: "Automation Name" }, automationId: { type: "string", title: "Automation Id" },
        errorMessage: { type: "string", title: "Error Message" }, totalCount: { type: "integer", title: "Total Count" }, countSinceLastAck: { type: "integer", title: "Count Since Last Answer" },
        lastRunUrl: { type: "string", title: "Last Run URL" }, recentRuns: { type: "string", title: "Recent Runs" },
      }, required: ["found", "issueId", "summary", "state", "automationName", "automationId", "errorMessage", "totalCount", "countSinceLastAck", "lastRunUrl", "recentRuns"] },
      parameters: { issue: issue.objects, runs: runs.objects, regs: regs.objects },
      code: [
        "import groovy.json.JsonOutput",
        "def I = (binding.hasVariable('issue') && issue instanceof List && issue) ? issue[0] : null",
        "if (!(I instanceof Map)) return [found: false, issueId: '', summary: 'No Sentinel Issue found for that id or thread.', state: '', automationName: '', automationId: '', errorMessage: '', totalCount: 0, countSinceLastAck: 0, lastRunUrl: '', recentRuns: '[]']",
        "def p = I.properties ?: [:]",
        "def R = (binding.hasVariable('regs') && regs instanceof List && regs && regs[0] instanceof Map) ? (regs[0].properties ?: [:]) : [:]",
        "def rr = ((binding.hasVariable('runs') && runs instanceof List) ? runs : []).collect { r -> def q = r.properties ?: [:]; [executionId: q.executionId, endTime: q.endTime, errorMessage: ((q.errorMessage ?: '') as String).take(300), exceptionClass: q.exceptionClass, runUrl: q.runUrl, nodeId: q.nodeId, parentExecutionId: q.parentExecutionId] }",
        "def name = (R.name ?: ('automation ' + (p.automationId ?: '?'))).toString()",
        "def ownerTxt = R.ownerSlackId ? ('<@' + R.ownerSlackId + '>') : (R.ownerName ?: 'unknown')",
        "def fmt = { v -> try { java.time.Instant.ofEpochMilli(v as Long).atZone(java.time.ZoneId.of('Asia/Kolkata')).format(java.time.format.DateTimeFormatter.ofPattern('dd MMM HH:mm')) } catch (Exception e) { '?' } }",
        "def s = 'Issue ' + I.id + ' | automation: ' + name + ' (' + (p.automationId ?: '') + ') | state: ' + (p.state ?: '') + ' | severity: ' + (p.severity ?: '') + ' | error class: ' + (p.errorClass ?: '') + ' / ' + (p.exceptionClass ?: '') + ' | failures: ' + (p.totalCount ?: 0) + ' total, ' + (p.countSinceLastAck ?: 0) + ' since last answer | first seen ' + fmt(p.firstSeen) + ', last seen ' + fmt(p.lastSeen) + ' | owner: ' + ownerTxt + (p.suppressionType ? (' | suppression: ' + p.suppressionType + (p.suppressedUntil ? (' until ' + fmt(p.suppressedUntil)) : '')) : '') + ' | node: ' + (p.nodeId ?: '') + ' | sample error: ' + ((p.sampleErrorMessage ?: '') as String).take(500) + ' | latest run: ' + (p.lastRunUrl ?: '')",
        "return [found: true, issueId: I.id.toString(), summary: s, state: (p.state ?: '').toString(), automationName: name, automationId: (p.automationId ?: '').toString(), errorMessage: ((p.sampleErrorMessage ?: '') as String).take(1000), totalCount: (p.totalCount ?: 0) as Integer, countSinceLastAck: (p.countSinceLastAck ?: 0) as Integer, lastRunUrl: (p.lastRunUrl ?: '').toString(), recentRuns: JsonOutput.toJson(rr)]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    return { found: out.result.found, issueId: out.result.issueId, summary: out.result.summary, state: out.result.state, automationName: out.result.automationName, automationId: out.result.automationId, errorMessage: out.result.errorMessage, totalCount: out.result.totalCount, countSinceLastAck: out.result.countSinceLastAck, lastRunUrl: out.result.lastRunUrl, recentRuns: out.result.recentRuns };
  },
);
