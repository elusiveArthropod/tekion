import { automation, callable, op } from "@ua/automations";

export default automation(
  {
    name: "sentinel · ask-sentry",
    description: "Sentinel helper: asks the Sentry agent one question with Issue context and returns its text. Used for testing and by the poster for first-failure explanations. Tag: alert-monitoring.",
    settings: { enableRunLogging: true, enableNodeLevelLogging: true, enableVariableLogging: true },
    trigger: callable({
      setup: { type: "object", properties: { query: { type: "string", title: "Query" }, session: { type: "string", title: "Session" } }, required: ["query"] },
      result: { type: "object", properties: { text: { type: "string", title: "Text" } } },
    }),
  },
  (t) => {
    const ans = op("ai_agents_by_unifyapps", "ai_agents_by_unifyapps_invoke_agent", {
      parameters: { aiAgentId: "e_6b07c410f61bef41ade9150b", userQuery: t.query, sessionId: t.session, skipApprovalBeforeToolExecution: true },
    });
    // Keep the final answer: the runtime also emits "Executing the tool ..." status lines
    const last = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: { type: "object", properties: { responses: { type: "array", title: "Responses", items: { type: "object" } } } },
      output: { type: "object", additionalProperties: false, properties: { text: { type: "string", title: "Text" }, all: { type: "string", title: "All" } }, required: ["text", "all"] },
      parameters: { responses: ans.agentResponses },
      code: [
        "import groovy.json.JsonOutput",
        "def R = (binding.hasVariable('responses') && responses instanceof List) ? responses : []",
        "def texts = R.collect { (it instanceof Map && it.text != null) ? it.text.toString() : '' }.findAll { it }",
        "def real = texts.findAll { !(it =~ /^Executing the tool /) }",
        "def out = real ? real[-1] : (texts ? texts[-1] : 'Sentry gave no answer.')",
        "return [text: out, all: JsonOutput.toJson(texts)]",
      ].join("\n"),
      compile_static: false, captureStdOutput: false,
    });
    return { text: last.result.text };
  },
);
