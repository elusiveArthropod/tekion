import { automation, callable, op } from "@ua/automations";

export default automation(
  {
    name: "sentinel · test-failure",
    description: "Sentinel test helper: always fails with a known error so the notifier can be exercised on demand. Tag: alert-monitoring.",
    trigger: callable({
      setup: {
        type: "object",
        properties: {
          reason: { type: "string", title: "Reason" },
        },
      },
      result: {
        type: "object",
        properties: {
          ok: { type: "boolean", title: "Ok" },
        },
      },
    }),
  },
  (t) => {
    // Throw a deterministic error
    op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: {
        type: "object",
        properties: { reason: { type: "string", title: "Reason" } },
      },
      output: {
        type: "object",
        properties: { ok: { type: "boolean", title: "Ok" } },
      },
      parameters: { reason: t.reason },
      code: "def r = (binding.hasVariable('reason') && reason) ? reason : 'default'\nthrow new RuntimeException('SENTINEL_TEST_FAILURE: ' + r)",
      compile_static: false,
      captureStdOutput: false,
    });
    return { ok: true };
  },
);
