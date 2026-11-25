import { automation, eq, isIn, op, schedule, stop } from "@ua/automations";

export default automation(
  {
    name: "sentinel · grouper",
    description: "Sentinel Flow A, band 1-4: every 2 minutes, turns new Sentinel Failed Run records into Sentinel Issues: fingerprint, cascade, storm, counters, suppression and escalation checks. Posts nothing; it flags Issues with needsPost for the poster. Tag: alert-monitoring.",
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

    // New runs, oldest first
    const runs = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_failed_run",
      numberOfRecordsToFetch: "MULTIPLE",
      triggerInputCondition: eq("properties_state", "new"),
      sortBy: [{ field: "properties_ingestedAt", order: "ASC" }],
      page: { paginateBy: "OFFSET", limit: 200, offset: 0 },
    });

    // Fingerprint, classify, group, detect cascades and storms
    const plan = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: {
        type: "object",
        properties: {
          cfg: { type: "array", title: "Config", items: { type: "object" } },
          runs: { type: "array", title: "Runs", items: { type: "object" } },
        },
      },
      output: {
        type: "object",
        additionalProperties: false,
        properties: {
          runCount: { type: "integer", title: "Run Count" },
          groupCount: { type: "integer", title: "Group Count" },
          escalationThreshold: { type: "integer", title: "Escalation Threshold" },
          isStorm: { type: "boolean", title: "Is Storm" },
          stormDistinct: { type: "integer", title: "Storm Distinct Automations" },
          stormErrorClass: { type: "string", title: "Storm Error Class" },
          stormSample: { type: "string", title: "Storm Sample" },
          stormAutomationIds: { type: "string", title: "Storm Automation Ids" },
          now: { type: "integer", title: "Now" },
          groups: {
            type: "array", title: "Groups",
            items: { type: "object", additionalProperties: false, properties: {
              fingerprint: { type: "string", title: "Fingerprint" },
              automationId: { type: "string", title: "Automation Id" },
              nodeId: { type: "string", title: "Node Id" },
              exceptionClass: { type: "string", title: "Exception Class" },
              errorClass: { type: "string", title: "Error Class" },
              sampleErrorMessage: { type: "string", title: "Sample Error Message" },
              count: { type: "integer", title: "Count" },
              firstSeen: { type: "integer", title: "First Seen" },
              lastSeen: { type: "integer", title: "Last Seen" },
              lastExecutionId: { type: "string", title: "Last Execution Id" },
              lastRunUrl: { type: "string", title: "Last Run Url" },
              cascadeParentCount: { type: "integer", title: "Cascade Parent Count" },
              runIds: { type: "array", title: "Run Record Ids", items: { type: "string" } },
            } },
          },
        },
        required: ["runCount", "groupCount", "escalationThreshold", "isStorm", "stormDistinct", "stormErrorClass", "stormSample", "stormAutomationIds", "now", "groups"],
      },
      parameters: { cfg: cfg.objects, runs: runs.objects },
      code: [
        "import java.security.MessageDigest",
        "def C = [:]; ((binding.hasVariable('cfg') && cfg instanceof List) ? cfg : []).each { r -> def p = (r instanceof Map && r.properties instanceof Map) ? r.properties : [:]; if (p.key) C[p.key.toString()] = p.value?.toString() }",
        "def num = { k, d -> try { C[k] ? (C[k] as Integer) : d } catch (Exception e) { d } }",
        "def escT = num('escalationCountThreshold', 5), stormN = num('stormDistinctAutomations', 5)",
        "def R = ((binding.hasVariable('runs') && runs instanceof List) ? runs : []).findAll { it instanceof Map && it.properties instanceof Map }",
        "def now = System.currentTimeMillis()",
        "def norm = { String s -> if (!s) return ''; def x = s.toLowerCase()",
        "  x = x.replaceAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, '<uuid>')",
        "  x = x.replaceAll(/\\b[0-9a-f]{24}\\b/, '<oid>')",
        "  x = x.replaceAll(/\\d{4}-\\d{2}-\\d{2}[t ]\\d{2}:\\d{2}(:\\d{2})?(\\.\\d+)?(z|[+-]\\d{2}:?\\d{2})?/, '<ts>')",
        "  x = x.replaceAll(/https?:\\/\\/\\S+/, '<url>')",
        "  x = x.replaceAll(/\\b\\d+(\\.\\d+)?\\b/, '<n>')",
        "  x = x.replaceAll(/\\s+/, ' ').trim(); return x.take(300) }",
        "def sha = { String s -> MessageDigest.getInstance('SHA-256').digest(s.getBytes('UTF-8')).encodeHex().toString().take(16) }",
        "def classify = { String msg, String cls -> def t = ((msg ?: '') + ' ' + (cls ?: '')).toLowerCase()",
        "  if (t =~ /\\b(401|403)\\b|unauthori|forbidden|token (has )?expired|invalid (access )?token|authentication failed|not authenticated/) return 'auth'",
        "  if (t =~ /\\b429\\b|rate limit|too many requests|quota/) return 'rate_limit'",
        "  if (t =~ /kafka|\\b(500|502|503|504)\\b|timed? ?out|timeout|connection refused|service unavailable|out of memory|internal server error|gateway/) return 'infra'",
        "  if (t =~ /connection|unknown host|dns|ssl|socket|handshake/) return 'connector'",
        "  return 'app' }",
        "def execIds = R.collect { it.properties.executionId?.toString() }.findAll { it } as Set",
        "def parentIds = R.collect { it.properties.parentExecutionId?.toString() }.findAll { it } as Set",
        "def byExec = [:]; R.each { r -> byExec[r.properties.executionId?.toString()] = r }",
        "def groups = [:]",
        "def keyOf = { r -> def p = r.properties; def cls = (p.exceptionClass ?: 'UNKNOWN').toString(); def n = norm((p.errorMessage ?: '').toString()); return [fp: p.automationId.toString() + '|' + (p.nodeId ?: '').toString() + '|' + cls + '|' + sha(n), cls: cls, n: n] }",
        "// A run whose executionId is some other run's parentExecutionId is a cascade parent: it joins the child's group.",
        "def childOf = [:]; R.each { r -> def pe = r.properties.parentExecutionId?.toString(); if (pe && byExec[pe]) childOf[pe] = r }",
        "R.each { r ->",
        "  def p = r.properties; def target = r; def isParent = false",
        "  def ex = p.executionId?.toString()",
        "  if (childOf[ex]) { target = childOf[ex]; isParent = true }",
        "  def k = keyOf(target); def tp = target.properties",
        "  def g = groups[k.fp]",
        "  if (!g) { g = [fingerprint: k.fp, automationId: tp.automationId.toString(), nodeId: (tp.nodeId ?: '').toString(), exceptionClass: k.cls, errorClass: classify((tp.errorMessage ?: '').toString(), k.cls), sampleErrorMessage: ((tp.errorMessage ?: '').toString()).take(1000), count: 0, firstSeen: 0L, lastSeen: 0L, lastExecutionId: '', lastRunUrl: '', cascadeParentCount: 0, runIds: []]; groups[k.fp] = g }",
        "  def ts = (p.endTime ?: p.startTime ?: p.ingestedAt ?: now) as Long",
        "  g.count++; g.runIds << r.id.toString()",
        "  if (isParent) g.cascadeParentCount++",
        "  if (!g.firstSeen || ts < g.firstSeen) g.firstSeen = ts",
        "  if (ts >= g.lastSeen) { g.lastSeen = ts; if (!isParent) { g.lastExecutionId = ex ?: ''; g.lastRunUrl = (p.runUrl ?: '').toString() } }",
        "}",
        "def G = groups.values().toList()",
        "def distinct = (R.collect { it.properties.automationId?.toString() } as Set).size()",
        "def infraRuns = R.findAll { classify((it.properties.errorMessage ?: '').toString(), (it.properties.exceptionClass ?: '').toString()) in ['infra','connector'] }",
        "def isStorm = distinct >= stormN",
        "def stormCls = isStorm ? ((infraRuns.size() * 2 >= R.size()) ? 'infra' : 'app') : ''",
        "return [runCount: R.size(), groupCount: G.size(), escalationThreshold: escT, isStorm: isStorm, stormDistinct: distinct, stormErrorClass: stormCls,",
        "  stormSample: isStorm ? ((R[0].properties.errorMessage ?: '').toString().take(300)) : '', stormAutomationIds: isStorm ? (R.collect { it.properties.automationId?.toString() } as Set).join(',') : '', now: now, groups: G]",
      ].join("\n"),
      compile_static: false,
      captureStdOutput: false,
    });

    // One Issue per fingerprint group
    for (const g of plan.result.groups) {
      // Existing Issue for this fingerprint?
      const found = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
        object_type: "sentinel_issue",
        numberOfRecordsToFetch: "MULTIPLE",
        triggerInputCondition: eq("properties_fingerprint", g.fingerprint),
        page: { paginateBy: "OFFSET", limit: 1, offset: 0 },
      });

      // Decide: create or update, new state, counters, severity, what the poster should do
      const decide = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
        input: {
          type: "object",
          properties: {
            found: { type: "array", title: "Found", items: { type: "object" } },
            group: { type: "object", title: "Group" },
            threshold: { type: "integer", title: "Threshold" },
            now: { type: "integer", title: "Now" },
          },
        },
        output: {
          type: "object",
          additionalProperties: false,
          properties: {
            exists: { type: "boolean", title: "Exists" },
            issueId: { type: "string", title: "Issue Id" },
            state: { type: "string", title: "State" },
            severity: { type: "string", title: "Severity" },
            escalationLevel: { type: "string", title: "Escalation Level" },
            totalCount: { type: "integer", title: "Total Count" },
            countSinceLastAck: { type: "integer", title: "Count Since Last Ack" },
            reopenCount: { type: "integer", title: "Reopen Count" },
            needsPost: { type: "boolean", title: "Needs Post" },
            postKind: { type: "string", title: "Post Kind" },
          },
          required: ["exists", "issueId", "state", "severity", "escalationLevel", "totalCount", "countSinceLastAck", "reopenCount", "needsPost", "postKind"],
        },
        parameters: { found: found.objects, group: g, threshold: plan.result.escalationThreshold, now: plan.result.now },
        code: [
          "def F = (binding.hasVariable('found') && found instanceof List) ? found : []",
          "def g = (binding.hasVariable('group') && group instanceof Map) ? group : [:]",
          "def T = (binding.hasVariable('threshold') && threshold != null) ? (threshold as Integer) : 5",
          "def n = (g.count ?: 1) as Integer",
          "def sevFor = { String ec, int c -> if (ec == 'infra') return 'high'; if (c >= 20) return 'high'; if (c >= 5) return 'medium'; return 'low' }",
          "if (F.isEmpty()) {",
          "  return [exists: false, issueId: '', state: 'new', severity: sevFor((g.errorClass ?: 'app').toString(), n), escalationLevel: 'L0', totalCount: n, countSinceLastAck: n, reopenCount: 0, needsPost: true, postKind: 'new']",
          "}",
          "def row = F[0]; def p = (row.properties instanceof Map) ? row.properties : [:]",
          "def st = (p.state ?: 'new').toString()",
          "def total = ((p.totalCount ?: 0) as Integer) + n",
          "def since = ((p.countSinceLastAck ?: 0) as Integer) + n",
          "def reopen = (p.reopenCount ?: 0) as Integer",
          "def level = (p.escalationLevel ?: 'L0').toString()",
          "def until = (p.suppressedUntil ?: 0) as Long",
          "def nowL = now as Long",
          "def newState = st; def kind = 'repeat'; def post = true",
          "if (st == 'resolved') { newState = 'reopened'; reopen++; kind = 'reopen'; since = n; level = 'L2' }",
          "else if (st == 'suppressed' && (until == 0L || until > nowL)) { newState = 'suppressed'; kind = 'repeat'; post = false }",
          "else if (st == 'suppressed') { newState = 'triaging'; kind = 'escalate'; level = 'L6' }",
          "else if (st in ['new','pending_agent']) { newState = st; kind = 'repeat' }",
          "else if (st in ['triaging','tracked','reopened'] && since >= T) { newState = 'escalated'; kind = 'escalate'; level = 'L2' }",
          "else if (st == 'escalated') { kind = 'repeat' }",
          "def sev = sevFor((g.errorClass ?: p.errorClass ?: 'app').toString(), total); if (newState == 'reopened' || newState == 'escalated') sev = (sev == 'low') ? 'medium' : 'high'",
          "return [exists: true, issueId: row.id.toString(), state: newState, severity: sev, escalationLevel: level, totalCount: total, countSinceLastAck: since, reopenCount: reopen, needsPost: post, postKind: post ? kind : 'none']",
        ].join("\n"),
        compile_static: false,
        captureStdOutput: false,
      });

      // Registry row for this automation (C6: unknown automations get a row without an owner)
      const reg = op("storage_by_unifyapps", "storage_by_unifyapps_count_records", {
        object_type: "sentinel_workflow_registry",
        triggerInputCondition: eq("properties_automationId", g.automationId),
      });
      if (eq(reg.count, 0)) {
        op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
          object_type: "sentinel_workflow_registry",
          record: { automationId: g.automationId, criticality: "medium", isLongRunning: false, active: true, source: "auto", lastFailureAt: g.lastSeen },
        }, { onError: "CONTINUE" });
      }

      if (eq(decide.result.exists, false)) {
        // Create the Issue
        const created = op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
          object_type: "sentinel_issue",
          record: {
            fingerprint: g.fingerprint,
            automationId: g.automationId,
            nodeId: g.nodeId,
            exceptionClass: g.exceptionClass,
            errorClass: g.errorClass,
            sampleErrorMessage: g.sampleErrorMessage,
            state: decide.result.state,
            severity: decide.result.severity,
            escalationLevel: decide.result.escalationLevel,
            firstSeen: g.firstSeen,
            lastSeen: g.lastSeen,
            totalCount: decide.result.totalCount,
            countSinceLastAck: decide.result.countSinceLastAck,
            reopenCount: 0,
            lastExecutionId: g.lastExecutionId,
            lastRunUrl: g.lastRunUrl,
            needsPost: decide.result.needsPost,
            postKind: decide.result.postKind,
            lastGroupedAt: plan.result.now,
          },
        });
        // Mark the runs grouped under the new Issue
        op("storage_by_unifyapps", "storage_by_unifyapps_update_records", {
          object_type: "sentinel_failed_run",
          numberOfRecordsToUpdate: "MULTIPLE",
          triggerInputCondition: isIn("id", g.runIds),
          updateFields: [
            { fieldName: "properties.state", actionType: "SET", setValue: "grouped" },
            { fieldName: "properties.fingerprint", actionType: "SET", setValue: g.fingerprint },
            { fieldName: "properties.issueId", actionType: "SET", setValue: created.id },
          ],
          page: { limit: 500, offset: 0 },
        });
      } else {
        // Update the existing Issue
        op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
          object_type: "sentinel_issue",
          recordId: decide.result.issueId,
          updateFields: [
            { fieldName: "properties.state", actionType: "SET", setValue: decide.result.state },
            { fieldName: "properties.severity", actionType: "SET", setValue: decide.result.severity },
            { fieldName: "properties.escalationLevel", actionType: "SET", setValue: decide.result.escalationLevel },
            { fieldName: "properties.totalCount", actionType: "SET", setValue: `${decide.result.totalCount}` },
            { fieldName: "properties.countSinceLastAck", actionType: "SET", setValue: `${decide.result.countSinceLastAck}` },
            { fieldName: "properties.reopenCount", actionType: "SET", setValue: `${decide.result.reopenCount}` },
            { fieldName: "properties.lastSeen", actionType: "SET", setValue: `${g.lastSeen}` },
            { fieldName: "properties.lastExecutionId", actionType: "SET", setValue: g.lastExecutionId },
            { fieldName: "properties.lastRunUrl", actionType: "SET", setValue: g.lastRunUrl },
            { fieldName: "properties.needsPost", actionType: "SET", setValue: `${decide.result.needsPost}` },
            { fieldName: "properties.postKind", actionType: "SET", setValue: decide.result.postKind },
            { fieldName: "properties.lastGroupedAt", actionType: "SET", setValue: `${plan.result.now}` },
          ],
        });
        // Mark the runs grouped under the existing Issue
        op("storage_by_unifyapps", "storage_by_unifyapps_update_records", {
          object_type: "sentinel_failed_run",
          numberOfRecordsToUpdate: "MULTIPLE",
          triggerInputCondition: isIn("id", g.runIds),
          updateFields: [
            { fieldName: "properties.state", actionType: "SET", setValue: "grouped" },
            { fieldName: "properties.fingerprint", actionType: "SET", setValue: g.fingerprint },
            { fieldName: "properties.issueId", actionType: "SET", setValue: decide.result.issueId },
          ],
          page: { limit: 500, offset: 0 },
        });
      }
    }

    stop();
  },
);
