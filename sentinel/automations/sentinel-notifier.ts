import { and, appEvent, automation, ne, op, stop, TRIGGER } from "@ua/automations";

export default automation(
  {
    name: "sentinel · notifier",
    description: "Sentinel Flow A step 1: stores every failed automation run on this platform as a Sentinel Failed Run record. Does nothing else: no Slack, no AI. Tag: alert-monitoring.",
    settings: {
      enableNodeLevelLogging: true,
      enableRunLogging: true,
      enableVariableLogging: true,
    },
    trigger: appEvent("platform_by_unifyapps", "platform_by_unifyapps_on_automation_run_failed", {
      // Builder test runs are noise (A10). Sentinel's own automations are excluded so a failure cannot loop (G4);
      // the list is maintained in sentinel/CONFIG.md.
      triggerInputCondition: and(
        ne(TRIGGER.isTestRun, true),
        ne(TRIGGER.automationId, "6b071c56e61cdd44b6f3050f"),
        // Known noise, excluded by the existing Node Failure Alert poller too (thousands of runs per hour). See CONFIG.md.
        ne(TRIGGER.automationId, "68b827559a4a9d0149caa07d"),
        ne(TRIGGER.automationId, "6857dea0c42da15675ef3827"),
        ne(TRIGGER.automationId, "66af3ff4cd79b321cb478a37"),
        ne(TRIGGER.automationId, "68c82cf26d4de43586f67a81"),
      ),
    }),
  },
  (t) => {
    // Parse the error payload: first usable message, exception class, raw JSON without headers, capped
    const parsed = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: {
        type: "object",
        properties: {
          event: { type: "object", title: "Event" },
          error: { type: "array", title: "Error", items: { type: "object" } },
        },
      },
      output: {
        type: "object",
        additionalProperties: false,
        properties: {
          errorMessage: { type: "string", title: "Error Message" },
          exceptionClass: { type: "string", title: "Exception Class" },
          errorRaw: { type: "string", title: "Error Raw" },
          errorTruncated: { type: "boolean", title: "Error Truncated" },
          runUrl: { type: "string", title: "Run URL" },
          now: { type: "integer", title: "Now" },
          userId: { type: "string", title: "User Id" },
          projectId: { type: "string", title: "Project Id" },
          retryCount: { type: "integer", title: "Retry Count" },
        },
        required: ["errorMessage", "exceptionClass", "errorRaw", "errorTruncated", "runUrl", "now", "userId", "projectId", "retryCount"],
      },
      parameters: {
        event: t,
        error: t.error,
      },
      code: [
        "import groovy.json.JsonOutput",
        "def MAX = 16000",
        "def ev = (binding.hasVariable('event') && event instanceof Map) ? event : [:]",
        "def errs = (binding.hasVariable('error') && error instanceof List) ? error : ((ev.error instanceof List) ? ev.error : [])",
        "def pick = { o, keys -> for (k in keys) { def v = (o instanceof Map) ? o[k] : null; if (v instanceof CharSequence && v.toString().trim()) return v.toString() }; return '' }",
        "def strip",
        "strip = { o -> if (o instanceof Map) { def m = [:]; o.each { k, v -> if (k != 'headers') m[k] = strip(v) }; return m } else if (o instanceof List) { return o.collect { strip(it) } } else { return o } }",
        "def msg = '', cls = '', httpStatus = ''",
        "// A parent automation wraps its child's error as a stringified map: [rootCauseMessage:X, errorCode:-1, errorId:..., message:X]. Unwrap to X.",
        "def unwrap = { String m -> def cur = m; for (int i = 0; i < 5; i++) { def mm = (cur =~ /^\\[rootCauseMessage:(.*), errorCode:-?\\d+, errorId:[0-9a-f-]+, message:(.*)\\]$/); if (mm.matches()) cur = mm.group(2) else break }; return cur }",
        "// error[] holds one entry per failing node: {id, type: 'inputs'|'outputs', output: {...}}.",
        "// The error itself sits in the 'outputs' entry: output.message / rootCauseMessage / errorCode / errorId,",
        "// or, for HTTP nodes, output.body.error.{message, code, status}.",
        "errs.each { e ->",
        "  if (!(e instanceof Map)) return",
        "  if (e.type == 'inputs') { def d = (e.output instanceof Map && e.output.errorDetails instanceof Map) ? e.output.errorDetails : null; if (d) { def sc = d.status_code ?: d.status; if (sc != null && !httpStatus) httpStatus = sc.toString() }; return }",
        "  def out = (e.output instanceof Map) ? e.output : e",
        "  if (!msg) msg = pick(out, ['errorMessage', 'message', 'rootCauseMessage'])",
        "  def inner = (out.body instanceof Map && out.body.error instanceof Map) ? out.body.error : null",
        "  if (!msg && inner) msg = pick(inner, ['message', 'status'])",
        "  if (!cls) cls = pick(out, ['exceptionClass'])",
        "  if (!cls && inner && inner.code != null) cls = 'HTTP_' + inner.code",
        "  if (!cls && inner && inner.status) cls = 'HTTP_' + inner.status",
        "  if (!cls && out.errorCode != null && out.errorCode != -1) cls = 'ERR_' + out.errorCode",
        "}",
        "if (!cls && msg) { def m = (msg =~ /^([A-Za-z_][A-Za-z0-9_.]*Exception|[A-Z][A-Z0-9_]{3,})/); if (m.find()) cls = m.group(1) }",
        "if (msg) msg = unwrap(msg)",
        "if (!cls && httpStatus) cls = 'HTTP_' + httpStatus",
        "if (!msg) msg = errs ? 'unparsed error' : 'no error payload'",
        "if (!cls) cls = 'UNKNOWN'",
        "def raw = JsonOutput.toJson(strip(errs))",
        "def truncated = raw.length() > MAX",
        "if (truncated) raw = raw.substring(0, MAX)",
        "def asStr = { v -> v == null ? '' : String.valueOf(v) }",
        "def asInt = { v -> try { v == null ? 0 : ((v as Long).intValue()) } catch (Exception ex) { 0 } }",
        "return [errorMessage: msg.take(2000), exceptionClass: cls.take(300), errorRaw: raw, errorTruncated: truncated,",
        "  runUrl: ('https://finance.toc.tekioncloud.xyz/p/0/automations/' + asStr(ev.automationId) + '/runs/' + asStr(ev.executionId)),",
        "  now: System.currentTimeMillis(), userId: asStr(ev.userId), projectId: asStr(ev.projectId), retryCount: asInt(ev.retryCount)]",
      ].join("\n"),
      compile_static: false,
      captureStdOutput: false,
    });

    // Store the run (unique executionId: a duplicate event fails here and is ignored, A4)
    op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
      object_type: "sentinel_failed_run",
      record: {
        executionId: t.executionId,
        automationId: t.automationId,
        rootExecutionId: t.rootExecutionId,
        parentExecutionId: t.parentExecutionId,
        nodeId: t.nodeId,
        exceptionClass: parsed.result.exceptionClass,
        errorMessage: parsed.result.errorMessage,
        errorRaw: parsed.result.errorRaw,
        errorTruncated: parsed.result.errorTruncated,
        retryCount: parsed.result.retryCount,
        isTestRun: t.isTestRun,
        userId: parsed.result.userId,
        projectId: parsed.result.projectId,
        startTime: t.startTime,
        endTime: t.endTime,
        runUrl: parsed.result.runUrl,
        state: "new",
        ingestedAt: parsed.result.now,
      },
    }, { onError: "CONTINUE" });

    stop();
  },
);
