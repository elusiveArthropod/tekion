import { automation, schedule, op, TRIGGER, and, continueIf, each, eq, gt, gte, ne, or, stop } from "@ua/automations";

export default automation(
  {
    name: "Node Failure Alert - Finance",
    settings: {
      enableNodeLevelLogging: true,
      enableRunLogging: true,
      enableVariableLogging: true,
      route: {
        default: false,
        tierName: "global",
      },
    },
    trigger: schedule({
      cron: "INTERVAL",
      sequential: false,
      maxWaitTime: 30,
      interval: 5,
      sequentialRunTimeUnit: "MINUTES",
      frequency: "MINUTES",
    }),
  },
  () => {
    // Code By UnifyApps
    const codeByUnifyapps = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      output: {
        additionalProperties: false,
        properties: {
          currentTimeEpochMs: {
            title: "currentTimeEpochMs",
            type: "integer",
          },
          startTimeEpochMs: {
            title: "startTimeEpochMs",
            type: "integer",
          },
        },
        type: "object",
      },
      code: "import java.time.*\n\ndef zone = ZoneId.of(\"Asia/Kolkata\")\n\n// Current time\ndef now = ZonedDateTime.now(zone)\ndef currentEpochMs = now.toInstant().toEpochMilli()\n\n// Start time = current time - 5 minutes\ndef startTime = now.minusMinutes(5)\ndef startTimeEpochMs = startTime.toInstant().toEpochMilli()\n\nreturn [\n    currentTimeEpochMs: currentEpochMs,\n    startTimeEpochMs: startTimeEpochMs\n]",
      compile_static: false,
      isAsync: false,
      captureStdOutput: false,
    });
    // Standard entities
    const standardEntities = op("standard_entities", "standard_entities_fetch_entities", {
      projections: [
        {
          aggregationFunction: "GROUP",
          name: "name",
        },
        {
          name: "id",
          aggregationFunction: "GROUP",
        },
        {
          name: "oUId",
          aggregationFunction: "GROUP",
        },
      ],
      entityType: "WorkflowDefinition",
      page: {
        limit: 100,
      },
      group: "STANDARD",
    });
    // Analytics by UnifyApps
    op("analytics_by_unifyapps", "analytics_by_unifyapps_query_reports", {
      projections: [
        {
          name: "ID",
          aggregationFunction: "COUNT",
          alias: "execution_count",
          includePercentageChange: false,
        },
        {
          name: "WORKFLOW_ID",
          aggregationFunction: "GROUP",
          alias: "workflow",
          includePercentageChange: false,
        },
        {
          name: "END_TIME",
          aggregationFunction: "GROUP",
          alias: "endTime",
          includePercentageChange: false,
        },
        {
          name: "ID",
          aggregationFunction: "GROUP",
          alias: "Execution",
          includePercentageChange: false,
        },
        {
          name: "USER_ID",
          aggregationFunction: "GROUP",
          alias: "User",
          includePercentageChange: false,
        },
      ],
      filter: and(
        or(
          eq("STATUS", "FAILED"),
        ),
        ne("WORKFLOW_ID", "68b827559a4a9d0149caa07d"),
        ne("WORKFLOW_ID", "6857dea0c42da15675ef3827"),
        ne("WORKFLOW_ID", "66af3ff4cd79b321cb478a37"),
        ne("WORKFLOW_ID", "68c82cf26d4de43586f67a81"),
      ),
      entityType: "WORKFLOW_EXECUTION",
      includeTotalHits: true,
      page: {
        limit: 100,
      },
      timeFilter: {
        since: codeByUnifyapps.result.startTimeEpochMs,
        until: codeByUnifyapps.result.currentTimeEpochMs,
      },
      group: "PLATFORM",
    });
    // Code by UnifyApps
    const codeByUnifyapps2 = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      output: {
        type: "object",
        additionalProperties: false,
        properties: {
          result: {
            type: "array",
            items: {
              type: "object",
              properties: {
                workflowId: {
                  type: "string",
                  title: "workflowId",
                },
                count: {
                  type: "integer",
                  title: "count",
                },
                latestExecutionId: {
                  type: "string",
                  title: "latestExecutionId",
                },
                workflowName: {
                  type: "string",
                  title: "Workflow Name",
                },
                ownerId: {
                  type: "integer",
                  title: "Owner Id",
                },
              },
              additionalProperties: false,
              required: [],
            },
            title: "result",
          },
        },
      },
      input: {
        type: "object",
        additionalProperties: false,
        required: [],
        properties: {
          objects: {
            type: "array",
            items: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            title: "Objects",
          },
          limit: {
            type: "integer",
            title: "Limit",
          },
          workflowMeta: {
            type: "array",
            items: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            title: "Workflow Meta",
          },
        },
      },
      code: "// Ensure objects exist\nif (!binding.hasVariable('objects') || objects == null) {\n    objects = []\n}\n\n// New dataset (metadata)\ndef workflowMeta = binding.hasVariable('workflowMeta') ? workflowMeta : []\n\n// Create lookup: workflowId -> [ownerId, name]\ndef workflowMap = workflowMeta.collectEntries {\n    [\n        (it.columns.id): [\n            ownerId: it.columns.oUId,\n            name   : it.columns.name\n        ]\n    ]\n}\n\ndef timeLimit = (binding.hasVariable('limit') && limit) ? limit : 15\n\ndef now = System.currentTimeMillis()\ndef cutoff = now - (timeLimit * 60 * 1000)  // last X minutes\n\ndef result = objects\n    .findAll { it.endTime && it.endTime > cutoff }\n    .groupBy { it.workflow }\n    .collect { workflow, entries ->\n\n        def latestEntry = entries.max { it.endTime ?: 0 }\n        def meta = workflowMap[workflow] ?: [:]\n\n        [\n            workflowId        : workflow,\n            workflowName      : meta.name,      // 👈 added\n            ownerId           : meta.ownerId,   // 👈 added\n            count             : entries.sum { it.execution_count ?: 0 },\n            latestExecutionId : latestEntry?.Execution\n        ]\n    }\n\nreturn [\n    result: result\n]",
      compile_static: false,
      captureStdOutput: false,
      parameters: {
        limit: 15,
        objects: {
          source: "{{ 84GrO.outputs.objects }}",
          "ua:type": "mappedArray",
          items: "{{ 84GrO.outputs.objects[0].columns }}",
        },
        workflowMeta: standardEntities.objects.map((v) => v),
      },
    });
    // Condition
    if (and(
      gte(codeByUnifyapps2.result.result[0].count, "1"),
    )) {
      // Variable by UnifyApps
      const variableByUnifyapps = op("variable_by_unifyapps", "variable_by_unifyapps_create_list", {
        createList: {
          "ua:type": "mappedArray",
        },
        "ua:title": "List",
        "ua:list_type": "OBJECT",
      });
      // Loop
      for (const loop of each(codeByUnifyapps2.result.result, {
        repeatMode: "SINGLE",
        captureIterations: false,
      })) {
        // Condition
        if (and(
          gt(loop.count, "0"),
        )) {
        } else {
          // Continue
          continue;
        }
        // Standard entities by UnifyApps
        op("standard_entities", "standard_entities_get_automation_details", {
          workflowIds: loop.workflowId,
          includeVersion: false,
          includeEverything: false,
          includeNodesAndEdges: false,
        }, { skip: true });
        // Code by UnifyApps
        const codeByUnifyapps3 = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
          output: {
            type: "object",
            additionalProperties: false,
            required: [
              "url",
            ],
            properties: {
              url: {
                type: "string",
                title: "Url",
              },
            },
          },
          input: {
            type: "object",
            additionalProperties: false,
            required: [
              "workflow",
            ],
            properties: {
              workflow: {
                type: "string",
                title: "Workflow",
              },
              id: {
                type: "string",
                title: "Id",
              },
            },
          },
          code: "\n// Then concatenate for URL\ndef url = \"https://finance.toc.tekioncloud.xyz/p/0/automations/\" + workflow + \"/runs/\" + id;\n\nreturn [url : url]",
          compile_static: false,
          isAsync: false,
          captureStdOutput: false,
          parameters: {
            workflow: loop.workflowId,
            id: loop.latestExecutionId,
          },
        });
        // Standard entities
        const standardEntities2 = op("standard_entities", "standard_entities_fetch_user", {
          fetchBy: "id",
          applicationId: "",
          user: loop.ownerId,
        });
        // Standard entities by UnifyApps
        const standardEntitiesByUnifyapps = op("standard_entities", "standard_entities_get_automation_details", {
          workflowIds: loop.workflowId,
          includeVersion: false,
          includeEverything: false,
          includeNodesAndEdges: false,
        });
        // Slack
        const slack = op("slack", "slack_get_user_info_by_email", {
          email: standardEntities2.contactDetails.email,
        }, { connectionId: "6a195dd6d2f2567c2fcadf32" });
        // Variable by UnifyApps
        op("variable_by_unifyapps", "variable_by_unifyapps_add_item_to_list", {
          itemToAdd: {
            workflow_id: loop.workflowId,
            Count: loop.count,
            workflowName: standardEntitiesByUnifyapps.automationDetails[0].name,
            url: codeByUnifyapps3.result.url,
            ownerId: loop.ownerId,
            tagName: slack.user.id,
          },
          insertLocation: "END",
          captureAddedItem: false,
          listName: variableByUnifyapps.items[0],
        });
      }
      // Loop
      for (const loop2 of each(variableByUnifyapps.items, {
        repeatMode: "SINGLE",
        captureIterations: false,
      })) {
        // Continue
        continueIf(and(
          eq(loop2.workflow_id, "6a620ee5aafae2696e73e56d"),
        ));
        // Code
        const code = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
          output: {
            additionalProperties: false,
            type: "object",
            properties: {
              body: {
                title: "body",
                type: "string",
              },
            },
          },
          input: {
            additionalProperties: false,
            required: [],
            type: "object",
            properties: {
              Count: {
                title: "Count",
                type: "integer",
              },
              slackUser_Id: {
                title: "Slack User Id",
                type: "string",
              },
              url: {
                title: "url",
                type: "string",
              },
              workflowName: {
                title: "workflowName",
                type: "string",
              },
              workflow_id: {
                title: "workflow_id",
                type: "string",
              },
            },
          },
          code: "def workflowId = (\n    binding.hasVariable('workflow_id') &&\n    workflow_id != null &&\n    workflow_id.toString().trim() &&\n    workflow_id.toString() != \"null\"\n) ? workflow_id.toString().trim() : \"N/A\"\n\ndef count = (\n    binding.hasVariable('Count') &&\n    Count != null &&\n    Count.toString() != \"null\"\n) ? Count : 0\n\ndef name = (\n    binding.hasVariable('workflowName') &&\n    workflowName != null &&\n    workflowName.toString().trim() &&\n    workflowName.toString() != \"null\"\n) ? workflowName.toString().trim() : \"Unknown Workflow\"\n\ndef link = (\n    binding.hasVariable('url') &&\n    url != null &&\n    url.toString().trim() &&\n    url.toString() != \"null\"\n) ? url.toString().trim() : \"N/A\"\n\n// Default fallback Slack User Group ID\ndef defaultSlackGroupId = \"S0B23CF34HK\"\n\n// Safe handling for slackUser_Id\ndef slackUserId = (\n    binding.hasVariable('slackUser_Id') &&\n    slackUser_Id != null &&\n    slackUser_Id.toString().trim() &&\n    slackUser_Id.toString() != \"null\"\n) ? slackUser_Id.toString().trim() : null\n\n// Mention user if available, otherwise mention group\ndef mention = slackUserId\n    ? \"<@${slackUserId}>\"\n    : \"<!subteam^${defaultSlackGroupId}>\"\n\ndef message = \"\"\"\n🚨 *ALERT: Workflow Failure Alert*\n\n*Owner:* ${mention}\n\n*Environment:* Finance\n*Workflow Name:* ${name}\n*Workflow ID:* ${workflowId}\n*Execution Count (last window):* ${count}\n\n🔗 *View Runs:* ${link}\n\"\"\"\n\nreturn [\n    body: message.trim()\n]",
          compile_static: false,
          captureStdOutput: false,
          parameters: {
            Count: loop2.Count,
            slackUser_Id: loop2.tagName,
            url: loop2.url,
            workflowName: loop2.workflowName,
            workflow_id: loop2.workflow_id,
          },
        });
        // Slack
        op("slack", "slack_post_message_in_channel", {
          link_names: true,
          messageType: "blocks",
          Attach: [
            {
              attachmentsBlock: {
                color: "#FF0000",
                mrkdwn_in: [
                  "text",
                  "pretext",
                  "fields",
                  "footer",
                ],
                text: code.result.body,
              },
              attachmentsType: "attachmentBlock",
            },
          ],
          channel: "C0B29TH1B71",
          text: `${loop2.workflow_id},${loop2.Count},${loop2.workflowName},${loop2.url}`,
          mrkdwn: true,
          username: "unifyApps",
        }, { connectionId: "6a195dd6d2f2567c2fcadf32" });
      }
    } else {
      // Stop
      stop();
    }
    // Stop
    stop();
  },
);
