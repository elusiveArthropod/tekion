import { automation, callable, op } from "@ua/automations";

export default automation(
  {
    name: "sentinel · registry-sync",
    description: "Sentinel: seeds and refreshes Sentinel Workflow Registry from the platform's automation list (name, platform owner). Human-set fields (owner Slack id, criticality, long-running) are never overwritten. Tag: alert-monitoring.",
    settings: { enableNodeLevelLogging: true, enableRunLogging: true, enableVariableLogging: true },
    trigger: callable({
      setup: { type: "object", properties: { limit: { type: "integer", title: "Limit" } } },
      result: { type: "object", properties: { seen: { type: "integer", title: "Seen" }, created: { type: "integer", title: "Created" }, updated: { type: "integer", title: "Updated" } } },
    }),
  },
  (t) => {
    // Platform automations: id, name, owner (ten pages of 500)
    const defs = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 0 },
    });
    const defs1 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 500 },
    });
    const defs2 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 1000 },
    });
    const defs3 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 1500 },
    });
    const defs4 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 2000 },
    });
    const defs5 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 2500 },
    });
    const defs6 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 3000 },
    });
    const defs7 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 3500 },
    });
    const defs8 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 4000 },
    });
    const defs9 = op("standard_entities", "standard_entities_fetch_entities", {
      entityType: "WorkflowDefinition", group: "STANDARD",
      projections: [{ name: "id", aggregationFunction: "GROUP" }, { name: "name", aggregationFunction: "GROUP" }, { name: "oUId", aggregationFunction: "GROUP" }],
      page: { limit: 500, offset: 4500 },
    });
    // Existing registry rows
    const existing = op("storage_by_unifyapps", "storage_by_unifyapps_fetch_records", {
      object_type: "sentinel_workflow_registry",
      numberOfRecordsToFetch: "MULTIPLE",
      page: { paginateBy: "OFFSET", limit: 5000, offset: 0 },
    });

    // Work out which rows to create and which names to refresh
    const plan = op("code_by_unifyapps", "code_by_unifyapps_groovy", {
      input: {
        type: "object",
        properties: {
          defs: { type: "array", title: "Defs", items: { type: "object" } },
          defs1: { type: "array", title: "Defs 1", items: { type: "object" } },
          defs2: { type: "array", title: "Defs 2", items: { type: "object" } },
          defs3: { type: "array", title: "Defs 3", items: { type: "object" } },
          defs4: { type: "array", title: "Defs 4", items: { type: "object" } },
          defs5: { type: "array", title: "Defs 5", items: { type: "object" } },
          defs6: { type: "array", title: "Defs 6", items: { type: "object" } },
          defs7: { type: "array", title: "Defs 7", items: { type: "object" } },
          defs8: { type: "array", title: "Defs 8", items: { type: "object" } },
          defs9: { type: "array", title: "Defs 9", items: { type: "object" } },
          existing: { type: "array", title: "Existing", items: { type: "object" } },
        },
      },
      output: {
        type: "object",
        additionalProperties: false,
        properties: {
          seen: { type: "integer", title: "Seen" },
          createdCount: { type: "integer", title: "Created Count" },
          renamedCount: { type: "integer", title: "Renamed Count" },
          toCreate: {
            type: "array", title: "To Create",
            items: { type: "object", additionalProperties: false, properties: {
              automationId: { type: "string", title: "Automation Id" },
              name: { type: "string", title: "Name" },
              ownerUserId: { type: "string", title: "Owner User Id" },
            } },
          },
          toRename: {
            type: "array", title: "To Rename",
            items: { type: "object", additionalProperties: false, properties: {
              id: { type: "string", title: "Record Id" },
              name: { type: "string", title: "Name" },
            } },
          },
        },
        required: ["seen", "createdCount", "renamedCount", "toCreate", "toRename"],
      },
      parameters: { defs: defs.objects, defs1: defs1.objects, defs2: defs2.objects, defs3: defs3.objects, defs4: defs4.objects, defs5: defs5.objects, defs6: defs6.objects, defs7: defs7.objects, defs8: defs8.objects, defs9: defs9.objects, existing: existing.objects },
      code: [
        "def D = []; ['defs', 'defs1', 'defs2', 'defs3', 'defs4', 'defs5', 'defs6', 'defs7', 'defs8', 'defs9'].each { k -> if (binding.hasVariable(k) && binding.getVariable(k) instanceof List) D.addAll(binding.getVariable(k)) }",
        "def E = (binding.hasVariable('existing') && existing instanceof List) ? existing : []",
        "def byId = [:]",
        "E.each { r -> def p = (r instanceof Map && r.properties instanceof Map) ? r.properties : [:]; if (p.automationId) byId[p.automationId.toString()] = [id: r.id?.toString(), name: p.name?.toString()] }",
        "def toCreate = [], toRename = []",
        "D.each { d ->",
        "  def c = (d instanceof Map && d.columns instanceof Map) ? d.columns : (d instanceof Map ? d : [:])",
        "  def id = c.id?.toString(); if (!id) return",
        "  def name = (c.name ?: '').toString(); def ownerId = c.oUId == null ? '' : c.oUId.toString()",
        "  def have = byId[id]",
        "  if (!have) toCreate << [automationId: id, name: name, ownerUserId: ownerId]",
        "  else if (name && have.name != name) toRename << [id: have.id, name: name]",
        "}",
        "return [seen: D.size(), createdCount: toCreate.size(), renamedCount: toRename.size(), toCreate: toCreate, toRename: toRename]",
      ].join("\n"),
      compile_static: false,
      captureStdOutput: false,
    });

    // Create missing rows
    for (const row of plan.result.toCreate) {
      op("storage_by_unifyapps", "storage_by_unifyapps_create_record", {
        object_type: "sentinel_workflow_registry",
        record: {
          automationId: row.automationId,
          name: row.name,
          ownerUserId: row.ownerUserId,
          criticality: "medium",
          isLongRunning: false,
          active: true,
          source: "seeded",
        },
      }, { onError: "CONTINUE" });
    }

    // Refresh renamed automations
    for (const row of plan.result.toRename) {
      op("storage_by_unifyapps", "storage_by_unifyapps_update_record_fields_by_id", {
        object_type: "sentinel_workflow_registry",
        recordId: row.id,
        updateFields: [{ fieldName: "properties.name", actionType: "SET", setValue: row.name }],
      }, { onError: "CONTINUE" });
    }

    return { seen: plan.result.seen, created: plan.result.createdCount, updated: plan.result.renamedCount };
  },
);
