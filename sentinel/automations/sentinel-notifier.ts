import { automation, schedule, op, RUN, and, eq, ne, isIn, stop } from "@ua/automations";

export default automation(
  {
    name: "sentinel · notifier",
    description: "Sentinel Flow A step 1. Every 5 minutes: fetch the automation runs that FAILED in the last 6 minutes (deployed runs only: RUN_TIME_TYPE DEFAULT, so builder tests and in-memory agent runs stay out), fetch the failed nodes of exactly those runs for the error details, and store ONE Sentinel Failed Run record per run in one bulk write. A run already stored by the previous overlapping tick is rejected by the unique index on executionId and left untouched (skipUpdate). No Slack, no AI. Tag: alert-monitoring.",
    settings: { enableNodeLevelLogging: true, enableRunLogging: true, enableVariableLogging: true, route: { default: false, tierName: "global" } },
    trigger: schedule({ cron: "INTERVAL", sequential: false, interval: 5, frequency: "MINUTES" }),
  },
  () => {
    // 1. Runs that failed in the window (run level: this is what "a failed automation run" means)
    const runs = op("analytics_by_unifyapps", "analytics_by_unifyapps_query_reports", {
      entityType: "WORKFLOW_EXECUTION",
      group: "PLATFORM",
      includeTotalHits: true,
      projections: [
        { name: "ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "WORKFLOW_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "STATUS", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "RUN_TIME_TYPE", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "TRIGGER_TYPE", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "WORKFLOW_VERSION", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "START_TIME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "END_TIME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "USER_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "ROOT_EXECUTION_INSTANCE_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "PARENT_EXECUTION_INSTANCE_ID", aggregationFunction: "GROUP", includePercentageChange: false },
      ],
      filter: and(
        eq("STATUS", "FAILED"),
        eq("RUN_TIME_TYPE", "DEFAULT"),
        ne("WORKFLOW_ID", "6b071c56e61cdd44b6f3050f"),
        ne("WORKFLOW_ID", "68b827559a4a9d0149caa07d"),
        ne("WORKFLOW_ID", "6857dea0c42da15675ef3827"),
        ne("WORKFLOW_ID", "66af3ff4cd79b321cb478a37"),
        ne("WORKFLOW_ID", "68c82cf26d4de43586f67a81"),
      ),
      page: { offset: 0, limit: 2000 },
      sorts: [{ field: "START_TIME", order: "DESC" }],
      timeFilter: { since: `=SUM(${RUN.currentTime},-360000)`, until: RUN.currentTime },
    });

    // 2. Their ids, as a list the next query can filter on
    const ids = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { runs: { type: "array", title: "Runs", items: { type: "object" } }, total: { type: "integer", title: "Total" } } },
      output: { type: "object", additionalProperties: false, properties: {
        executionIds: { type: "array", title: "Execution Ids", items: { type: "string" } },
        count: { type: "integer", title: "Count" }, truncated: { type: "boolean", title: "Truncated" },
      }, required: ["executionIds", "count", "truncated"] },
      parameters: { runs: runs.objects.map((v) => ({ columns: v.columns })), total: runs.total },
      code: [
        "def R = (binding.hasVariable('runs') && runs instanceof List) ? runs : []",
        "def ids = R.collect { r -> def c = (r instanceof Map && r.columns instanceof Map) ? r.columns : [:]; c.ID == null ? '' : c.ID.toString() }.findAll { it }",
        "if (!ids) ids = ['__none__']",
        "def t = binding.hasVariable('total') && total instanceof Number ? (total as Long) : 0L",
        "return [executionIds: ids, count: R.size(), truncated: t > R.size()]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    // 3. The failed nodes of exactly those runs, with their error payloads
    const nodes = op("analytics_by_unifyapps", "analytics_by_unifyapps_query_reports", {
      entityType: "WORKFLOW_NODE_EXECUTION",
      group: "PLATFORM",
      includeTotalHits: true,
      projections: [
        { name: "ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "EXECUTION_INSTANCE_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "CURRENT_NODE_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "CURRENT_NODE_APP_NAME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "CURRENT_NODE_RESOURCE_NAME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "CURRENT_NODE_CONNECTION_ID", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "ENTRY_TIME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "EXIT_TIME", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "RETRY_COUNT", aggregationFunction: "GROUP", includePercentageChange: false },
        { name: "OUTPUTS", aggregationFunction: "GROUP", includePercentageChange: false },
      ],
      filter: and(
        eq("STATUS", "FAILED"),
        ne("SKIPPED", true),
        isIn("EXECUTION_INSTANCE_ID", ids.result.executionIds),
      ),
      page: { offset: 0, limit: 5000 },
      sorts: [{ field: "ENTRY_TIME", order: "DESC" }],
      timeFilter: { since: `=SUM(${RUN.currentTime},-900000)`, until: RUN.currentTime },
    });

    // 4. One record per run: run facts from the run report, error from its earliest failing node, every failing node in errorRaw
    const parsed = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: {
        runs: { type: "array", title: "Runs", items: { type: "object" } },
        nodes: { type: "array", title: "Nodes", items: { type: "object" } },
        now: { type: "integer", title: "Now" },
      } },
      output: { type: "object", additionalProperties: false, properties: {
        rows: { type: "array", title: "Rows", items: { type: "object", properties: {
          executionId: { type: "string" }, automationId: { type: "string" }, rootExecutionId: { type: "string" }, parentExecutionId: { type: "string" },
          nodeId: { type: "string" }, exceptionClass: { type: "string" }, errorMessage: { type: "string" }, errorRaw: { type: "string" }, errorTruncated: { type: "boolean" },
          retryCount: { type: "integer" }, userId: { type: "string" }, startTime: { type: "integer" }, endTime: { type: "integer" }, runUrl: { type: "string" },
          state: { type: "string" }, isTestRun: { type: "boolean" }, projectId: { type: "string" }, ingestedAt: { type: "integer" },
        } } },
        count: { type: "integer", title: "Count" }, runsWithoutNodes: { type: "integer", title: "Runs Without Nodes" },
      }, required: ["rows", "count", "runsWithoutNodes"] },
      parameters: { runs: runs.objects.map((v) => ({ columns: v.columns })), nodes: nodes.objects.map((v) => ({ columns: v.columns })), now: RUN.currentTime },
      code: [
        "import groovy.json.JsonOutput",
        "def MAX = 16000, ENTRY_MAX = 4000, BASE = 'https://finance.toc.tekioncloud.xyz/p/0/automations/'",
        "def R = (binding.hasVariable('runs') && runs instanceof List) ? runs : []",
        "def N = (binding.hasVariable('nodes') && nodes instanceof List) ? nodes : []",
        "def nowMs = (binding.hasVariable('now') && now instanceof Number) ? (now as Long) : System.currentTimeMillis()",
        "def asStr = { v -> v == null ? '' : String.valueOf(v) }",
        "def num = { v -> (v instanceof Number) ? (v as Long) : null }",
        "def pick = { o, keys -> for (k in keys) { def v = (o instanceof Map) ? o[k] : null; if (v instanceof CharSequence && v.toString().trim()) return v.toString() }; return '' }",
        "def strip; strip = { o -> if (o instanceof Map) { def m = [:]; o.each { k, v -> if (k != 'headers') m[k] = strip(v) }; return m } else if (o instanceof List) { return o.collect { strip(it) } } else { return o } }",
        "def unwrap = { String m -> def cur = m; for (int i = 0; i < 5; i++) { def mm = (cur =~ /^\\[rootCauseMessage:(.*), errorCode:-?\\d+, errorId:[0-9a-f-]+, message:(.*)\\]$/); if (mm.matches()) cur = mm.group(2) else break }; return cur }",
        "// failing nodes grouped by run, one entry per nodeId (the DESC sort means the latest attempt is kept)",
        "def byRun = [:]",
        "N.each { e -> def c = (e instanceof Map && e.columns instanceof Map) ? e.columns : [:]; def ex = asStr(c.EXECUTION_INSTANCE_ID); if (!ex) return",
        "  def g = byRun[ex]; if (g == null) { g = [seen: [] as Set, nodes: []]; byRun[ex] = g }",
        "  def nid = asStr(c.CURRENT_NODE_ID); if (!g.seen.add(nid)) return",
        "  def o = (c.OUTPUTS instanceof Map) ? c.OUTPUTS : [:]",
        "  def msg = pick(o, ['errorMessage', 'message', 'rootCauseMessage'])",
        "  def inner = (o.body instanceof Map && o.body.error instanceof Map) ? o.body.error : null",
        "  if (!msg && inner) msg = pick(inner, ['message', 'status'])",
        "  if (!msg && o.body instanceof CharSequence && o.body.toString().trim()) msg = o.body.toString().take(500)",
        "  if (msg) msg = unwrap(msg)",
        "  def cls = pick(o, ['exceptionClass'])",
        "  def sc = o.status_code ?: o.status; if (!cls && sc != null && !(sc instanceof Map)) cls = 'HTTP_' + asStr(sc)",
        "  if (!cls && inner && inner.code != null) cls = 'HTTP_' + asStr(inner.code)",
        "  if (!cls && o.errorCode != null && o.errorCode != -1) cls = 'ERR_' + asStr(o.errorCode)",
        "  if (!cls && msg) { def m = (msg =~ /^([A-Za-z_][A-Za-z0-9_.]*Exception|[A-Z][A-Z0-9_]{3,})/); if (m.find()) cls = m.group(1) }",
        "  g.nodes << [nodeId: nid, cls: cls ?: 'UNKNOWN', msg: msg ?: 'no error payload', entryTime: num(c.ENTRY_TIME), exitTime: num(c.EXIT_TIME),",
        "    retryCount: (c.RETRY_COUNT instanceof Number) ? (c.RETRY_COUNT as Long).intValue() : 0, appName: asStr(c.CURRENT_NODE_APP_NAME),",
        "    resourceName: asStr(c.CURRENT_NODE_RESOURCE_NAME), connectionId: asStr(c.CURRENT_NODE_CONNECTION_ID), id: asStr(c.ID), payload: strip(o)]",
        "}",
        "def out = []; def noNodes = 0",
        "R.each { r -> def c = (r instanceof Map && r.columns instanceof Map) ? r.columns : [:]; def ex = asStr(c.ID); if (!ex) return",
        "  def g = byRun[ex]; def ordered = g ? g.nodes.sort(false) { a, b -> def ea = a.entryTime == null ? Long.MAX_VALUE : a.entryTime; def eb = b.entryTime == null ? Long.MAX_VALUE : b.entryTime; (ea == eb) ? (a.nodeId <=> b.nodeId) : (ea <=> eb) } : []",
        "  def primary = ordered ? ordered[0] : [nodeId: '', cls: 'RUN_FAILED', msg: 'run failed with no failed node row (' + asStr(c.STATUS) + ')', retryCount: 0, entryTime: null]",
        "  if (!ordered) noNodes++",
        "  def rc = 0; ordered.each { n -> if (n.retryCount > rc) rc = n.retryCount }",
        "  def entries = ordered.collect { n -> [nodeId: n.nodeId, currentNodeAppName: n.appName, currentNodeResourceName: n.resourceName, currentNodeConnectionId: n.connectionId, entryTime: n.entryTime, id: n.id, error: n.payload] }",
        "  def head = [executionId: ex, primaryNodeId: primary.nodeId, nodeCount: ordered.size(), runStatus: asStr(c.STATUS), runTimeType: asStr(c.RUN_TIME_TYPE), triggerType: asStr(c.TRIGGER_TYPE), workflowVersion: asStr(c.WORKFLOW_VERSION)]",
        "  def raw = JsonOutput.toJson(head + [nodes: entries]); def truncated = false",
        "  if (raw.length() > MAX) { def shrunk = []; entries.eachWithIndex { e, i -> if (i == 0) { shrunk << e; return }; def pj = JsonOutput.toJson(e.error); if (pj.length() > ENTRY_MAX) { def e2 = new LinkedHashMap(e); e2.error = pj.substring(0, ENTRY_MAX); e2.errorTruncated = true; truncated = true; shrunk << e2 } else { shrunk << e } }",
        "    raw = JsonOutput.toJson(head + [nodes: shrunk]); if (raw.length() > MAX) { raw = raw.substring(0, MAX); truncated = true } }",
        "  def autoId = asStr(c.WORKFLOW_ID) ?: 'platform-internal'",
        "  out << [executionId: ex, automationId: autoId, rootExecutionId: asStr(c.ROOT_EXECUTION_INSTANCE_ID), parentExecutionId: asStr(c.PARENT_EXECUTION_INSTANCE_ID),",
        "    nodeId: primary.nodeId, exceptionClass: primary.cls.take(300), errorMessage: primary.msg.take(2000), errorRaw: raw, errorTruncated: truncated, retryCount: rc,",
        "    userId: asStr(c.USER_ID), startTime: (num(c.START_TIME) ?: 0L), endTime: (num(c.END_TIME) ?: 0L), runUrl: BASE + autoId + '/runs/' + ex,",
        "    state: 'new', isTestRun: false, projectId: '', ingestedAt: nowMs]",
        "}",
        "result = [rows: out, count: out.size(), runsWithoutNodes: noNodes]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });

    // 5. One bulk write; runs stored by the previous overlapping tick are rejected by the unique index and left untouched
    op("storage_by_unifyapps", "storage_by_unifyapps_bulk_create_records", {
      useRawPayload: false,
      object_type: "sentinel_failed_run",
      skipIfBlank: false,
      skipUpdate: true,
      records: parsed.result.rows.map((v) => ({
        executionId: v.executionId, automationId: v.automationId, rootExecutionId: v.rootExecutionId, parentExecutionId: v.parentExecutionId,
        nodeId: v.nodeId, exceptionClass: v.exceptionClass, errorMessage: v.errorMessage, errorRaw: v.errorRaw, errorTruncated: v.errorTruncated,
        retryCount: v.retryCount, isTestRun: v.isTestRun, userId: v.userId, projectId: v.projectId, startTime: v.startTime, endTime: v.endTime,
        runUrl: v.runUrl, state: v.state, ingestedAt: v.ingestedAt,
      })),
    });
    stop();
  },
);
