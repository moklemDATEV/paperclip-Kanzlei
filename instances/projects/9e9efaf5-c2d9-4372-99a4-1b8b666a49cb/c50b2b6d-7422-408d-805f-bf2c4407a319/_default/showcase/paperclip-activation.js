const ACTIVATION_STAGE = "paperclip_issue_created";
const fs = require("node:fs/promises");
const path = require("node:path");

let cachedAgentDirectoryPromise = null;
let cachedIssueContextPromise = null;
let cachedRoleRoutingMapPromise = null;

const ROLE_ROUTING_ENTRIES = [
  { roleName: "Mandant Intake", assigneeKey: "mandantIntakeAgentId", fallbackUrlKey: "mandant-intake", fallbackName: "Mandant Intake" },
  { roleName: "Document Ingestion", assigneeKey: "documentIngestionAgentId", fallbackUrlKey: "document-ingestion", fallbackName: "Document Ingestion" },
  { roleName: "Bookkeeping Reconciliation", assigneeKey: "bookkeepingReconciliationAgentId", fallbackUrlKey: "bookkeeping-reconciliation", fallbackName: "Bookkeeping Reconciliation" },
  { roleName: "Tax Preparation", assigneeKey: "taxPreparationAgentId", fallbackUrlKey: "tax-preparation", fallbackName: "Tax Preparation" },
  { roleName: "Compliance Guard", assigneeKey: "complianceGuardAgentId", fallbackUrlKey: "compliance-guard", fallbackName: "Compliance Guard" },
  { roleName: "Steuerberater Review Copilot", assigneeKey: "reviewCopilotAgentId", fallbackUrlKey: "steuerberater-review-copilot", fallbackName: "Steuerberater Review Copilot" },
  { roleName: "Client Communication", assigneeKey: "clientCommunicationAgentId", fallbackUrlKey: "client-communication", fallbackName: "Client Communication" },
  { roleName: "CTO", assigneeKey: "ctoAgentId", fallbackUrlKey: "cto", fallbackName: "CTO" },
  { roleName: "CEO", assigneeKey: "ceoAgentId", fallbackUrlKey: "ceo", fallbackName: "CEO" },
];

function pickDefined(value, fallback = null) {
  return value != null && value !== "" ? value : fallback;
}

function normalizeLogicalOwnerName(value) {
  if (!value) {
    return null;
  }

  return String(value)
    .replace(/\s+after\s+explicit.*$/i, "")
    .replace(/\s+Agent$/i, "")
    .trim() || null;
}

function toBooleanFlag(value, fallback = false) {
  if (value == null || value === "") {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function getActivationConfig(config = {}) {
  const activation = config.paperclipActivation || {};
  const allowHeartbeatContext = toBooleanFlag(
    pickDefined(
      activation.allowHeartbeatContext,
      process.env.SHOWCASE_PAPERCLIP_ALLOW_HEARTBEAT_CONTEXT,
    ),
    false,
  );
  const enabledOverride = pickDefined(
    activation.enabled,
    process.env.SHOWCASE_PAPERCLIP_ACTIVATION_ENABLED,
  );
  const apiUrl = pickDefined(
    activation.apiUrl,
    process.env.SHOWCASE_PAPERCLIP_API_URL || (allowHeartbeatContext ? process.env.PAPERCLIP_API_URL : null),
  );
  const apiKey = pickDefined(
    activation.apiKey,
    process.env.SHOWCASE_PAPERCLIP_API_KEY || (allowHeartbeatContext ? process.env.PAPERCLIP_API_KEY : null),
  );
  const companyId = pickDefined(
    activation.companyId,
    process.env.SHOWCASE_PAPERCLIP_COMPANY_ID || (allowHeartbeatContext ? process.env.PAPERCLIP_COMPANY_ID : null),
  );
  const derivedEnabled = Boolean(apiUrl && apiKey && companyId);
  const enabled = enabledOverride == null
    ? derivedEnabled
    : !["0", "false", "no"].includes(String(enabledOverride).toLowerCase());

  return {
    enabled,
    allowHeartbeatContext,
    apiUrl,
    apiKey,
    companyId,
    projectId: pickDefined(
      activation.projectId,
      process.env.SHOWCASE_PAPERCLIP_PROJECT_ID || (allowHeartbeatContext ? process.env.PAPERCLIP_PROJECT_ID : null),
    ),
    goalId: pickDefined(
      activation.goalId,
      process.env.SHOWCASE_PAPERCLIP_GOAL_ID || (allowHeartbeatContext ? process.env.PAPERCLIP_GOAL_ID : null),
    ),
    parentId: pickDefined(
      activation.parentId,
      process.env.SHOWCASE_PAPERCLIP_PARENT_ISSUE_ID || (allowHeartbeatContext ? process.env.PAPERCLIP_PARENT_ISSUE_ID : null),
    ),
    runId: pickDefined(
      activation.runId,
      process.env.SHOWCASE_PAPERCLIP_RUN_ID
        || (allowHeartbeatContext ? process.env.PAPERCLIP_RUN_ID : null)
        || "showcase-telegram-runtime",
    ),
    assignees: {
      mandantIntakeAgentId: pickDefined(
        activation.mandantIntakeAgentId,
        process.env.SHOWCASE_PAPERCLIP_MANDANT_INTAKE_AGENT_ID,
      ),
      documentIngestionAgentId: pickDefined(
        activation.documentIngestionAgentId,
        process.env.SHOWCASE_PAPERCLIP_DOCUMENT_INGESTION_AGENT_ID,
      ),
      bookkeepingReconciliationAgentId: pickDefined(
        activation.bookkeepingReconciliationAgentId,
        process.env.SHOWCASE_PAPERCLIP_BOOKKEEPING_AGENT_ID,
      ),
      taxPreparationAgentId: pickDefined(
        activation.taxPreparationAgentId,
        process.env.SHOWCASE_PAPERCLIP_TAX_PREPARATION_AGENT_ID,
      ),
      complianceGuardAgentId: pickDefined(
        activation.complianceGuardAgentId,
        process.env.SHOWCASE_PAPERCLIP_COMPLIANCE_GUARD_AGENT_ID,
      ),
      reviewCopilotAgentId: pickDefined(
        activation.reviewCopilotAgentId,
        process.env.SHOWCASE_PAPERCLIP_REVIEW_AGENT_ID,
      ),
      clientCommunicationAgentId: pickDefined(
        activation.clientCommunicationAgentId,
        process.env.SHOWCASE_PAPERCLIP_CLIENT_COMMUNICATION_AGENT_ID,
      ),
      ctoAgentId: pickDefined(
        activation.ctoAgentId,
        process.env.SHOWCASE_PAPERCLIP_CTO_AGENT_ID,
      ),
      ceoAgentId: pickDefined(
        activation.ceoAgentId,
        process.env.SHOWCASE_PAPERCLIP_CEO_AGENT_ID,
      ),
    },
  };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Paperclip API request failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function loadCurrentIssueContext(activationConfig) {
  if (!activationConfig.allowHeartbeatContext || !process.env.PAPERCLIP_TASK_ID) {
    return null;
  }

  if (!cachedIssueContextPromise) {
    cachedIssueContextPromise = fetchJson(
      `${activationConfig.apiUrl}/api/issues/${process.env.PAPERCLIP_TASK_ID}/heartbeat-context`,
      {
        headers: {
          Authorization: `Bearer ${activationConfig.apiKey}`,
        },
      },
    );
  }

  return cachedIssueContextPromise;
}

async function loadAgentDirectory(activationConfig) {
  if (!cachedAgentDirectoryPromise) {
    cachedAgentDirectoryPromise = fetchJson(
      `${activationConfig.apiUrl}/api/companies/${activationConfig.companyId}/agents`,
      {
        headers: {
          Authorization: `Bearer ${activationConfig.apiKey}`,
        },
      },
    );
  }

  const agents = await cachedAgentDirectoryPromise;
  return agents.reduce((directory, agent) => {
    directory.byId.set(agent.id, agent);
    if (agent.urlKey) {
      directory.byUrlKey.set(agent.urlKey, agent);
    }
    directory.byName.set(agent.name, agent);
    return directory;
  }, {
    byId: new Map(),
    byUrlKey: new Map(),
    byName: new Map(),
  });
}

async function loadRoleRoutingMap(activationConfig) {
  if (!cachedRoleRoutingMapPromise) {
    cachedRoleRoutingMapPromise = (async () => {
      const directory = await loadAgentDirectory(activationConfig);
      const routes = new Map();

      for (const entry of ROLE_ROUTING_ENTRIES) {
        const configuredId = activationConfig.assignees[entry.assigneeKey];
        let agent = configuredId ? directory.byId.get(configuredId) : null;
        if (configuredId && !agent) {
          throw new Error(`Configured Paperclip assignee not found for ${entry.roleName}: ${configuredId}`);
        }

        if (!agent) {
          agent = directory.byName.get(entry.fallbackName) || directory.byUrlKey.get(entry.fallbackUrlKey) || null;
        }

        if (agent) {
          routes.set(entry.roleName, {
            roleName: entry.roleName,
            assigneeAgentId: agent.id,
            assigneeAgentName: agent.name,
            assigneeUrlKey: agent.urlKey || null,
          });
        }
      }

      return routes;
    })();
  }

  return cachedRoleRoutingMapPromise;
}

async function resolveAgentForLogicalOwnerName(activationConfig, ownerName) {
  const logicalOwnerName = normalizeLogicalOwnerName(ownerName);
  if (!logicalOwnerName || logicalOwnerName === "none") {
    return null;
  }

  const roleRoutingMap = await loadRoleRoutingMap(activationConfig);
  return roleRoutingMap.get(logicalOwnerName) || null;
}

async function uploadPaperclipAttachments({ activationConfig, issueId, attachments }) {
  if (!activationConfig.enabled || !Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  const uploaded = [];
  for (const attachment of attachments) {
    const filePath = attachment.sourceLink;
    if (!filePath) {
      continue;
    }

    try {
      await fs.stat(filePath);
    } catch (error) {
      console.warn(`Attachment missing, skipping upload: ${filePath}`);
      continue;
    }

    const fileName = attachment.fileName || path.basename(filePath);
    try {
      const formData = new FormData();
      const fileBuffer = await fs.readFile(filePath);
      formData.append(
        "file",
        new Blob([fileBuffer], { type: attachment.mimeType || "application/octet-stream" }),
        fileName,
      );

      const response = await fetch(
        `${activationConfig.apiUrl}/api/companies/${activationConfig.companyId}/issues/${issueId}/attachments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${activationConfig.apiKey}`,
            "X-Paperclip-Run-Id": activationConfig.runId,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Attachment upload failed (${response.status}): ${text}`);
      }

      uploaded.push({ issueId, filePath, fileName });
    } catch (error) {
      console.warn(`Failed to upload attachment ${fileName}: ${error.message}`);
    }
  }

  return uploaded;
}

function getRouteTargetKey(route) {
  if (route.assigneeUrlKey === "mandant-intake") {
    return "mandantIntakeAgentId";
  }
  if (route.assigneeUrlKey === "tax-preparation") {
    return "taxPreparationAgentId";
  }
  if (route.assigneeUrlKey === "compliance-guard") {
    return "complianceGuardAgentId";
  }
  if (route.assigneeUrlKey === "client-communication") {
    return "clientCommunicationAgentId";
  }
  if (route.assigneeUrlKey === "cto") {
    return "ctoAgentId";
  }
  if (route.assigneeUrlKey === "ceo") {
    return "ceoAgentId";
  }
  if (route.downstreamPath === "reference:contract_review") {
    return "reviewCopilotAgentId";
  }
  if (
    route.downstreamPath === "bookkeeping:auto_post"
    || route.downstreamPath === "bookkeeping:needs_review"
    || route.downstreamPath === "receivables:invoice_match"
  ) {
    return "bookkeepingReconciliationAgentId";
  }
  return "documentIngestionAgentId";
}

function findAgentByFallbackKey(directory, fallbackKey) {
  return directory.byUrlKey.get(fallbackKey) || directory.byName.get(fallbackKey) || null;
}

async function resolveAssigneeAgent(route, activationConfig) {
  const directory = await loadAgentDirectory(activationConfig);
  const configuredId = activationConfig.assignees[getRouteTargetKey(route)];
  if (configuredId) {
    const configuredAgent = directory.byId.get(configuredId);
    if (!configuredAgent) {
      throw new Error(`Configured Paperclip assignee not found: ${configuredId}`);
    }
    return configuredAgent;
  }

  if (route.assigneeUrlKey) {
    return findAgentByFallbackKey(directory, route.assigneeUrlKey);
  }

  if (route.downstreamPath === "reference:contract_review") {
    return findAgentByFallbackKey(directory, "steuerberater-review-copilot");
  }
  if (
    route.downstreamPath === "bookkeeping:auto_post"
    || route.downstreamPath === "bookkeeping:needs_review"
    || route.downstreamPath === "receivables:invoice_match"
  ) {
    return findAgentByFallbackKey(directory, "bookkeeping-reconciliation");
  }
  return findAgentByFallbackKey(directory, "document-ingestion");
}

function applyIssueContext(payload, activationConfig, currentIssueContext) {
  if (activationConfig.projectId) {
    payload.projectId = activationConfig.projectId;
  } else if (currentIssueContext?.issue?.projectId) {
    payload.projectId = currentIssueContext.issue.projectId;
  }
  if (activationConfig.goalId) {
    payload.goalId = activationConfig.goalId;
  } else if (currentIssueContext?.issue?.goalId) {
    payload.goalId = currentIssueContext.issue.goalId;
  }
  if (activationConfig.parentId) {
    payload.parentId = activationConfig.parentId;
  } else if (currentIssueContext?.issue?.id) {
    payload.parentId = currentIssueContext.issue.id;
  }

  return payload;
}

async function patchPaperclipIssue(activationConfig, issueId, payload) {
  return fetchJson(
    `${activationConfig.apiUrl}/api/issues/${issueId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${activationConfig.apiKey}`,
        "Content-Type": "application/json",
        "X-Paperclip-Run-Id": activationConfig.runId,
      },
      body: JSON.stringify(payload),
    },
  );
}

async function createConfiguredPaperclipIssue({ activationConfig, assignee, title, description, priority = "medium" }) {
  const currentIssueContext = await loadCurrentIssueContext(activationConfig);
  const payload = applyIssueContext({
    title,
    description,
    status: "todo",
    priority,
    assigneeAgentId: assignee.id,
  }, activationConfig, currentIssueContext);

  const issue = await fetchJson(
    `${activationConfig.apiUrl}/api/companies/${activationConfig.companyId}/issues`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activationConfig.apiKey}`,
        "Content-Type": "application/json",
        "X-Paperclip-Run-Id": activationConfig.runId,
      },
      body: JSON.stringify(payload),
    },
  );

  return {
    assigneeAgentId: assignee.id,
    assigneeAgentName: assignee.name,
    issueId: issue.id,
    issueIdentifier: issue.identifier || null,
    issueTitle: issue.title,
    createdAt: issue.createdAt || new Date().toISOString(),
  };
}

function buildIssueTitle(route) {
  return `Telegram intake: ${route.fileName}`;
}

function getWorkflowContract(route) {
  switch (route.downstreamPath) {
    case "bookkeeping:extract_fields":
      return {
        currentOwner: "Document Ingestion",
        completionRule:
          "Do not close after extraction alone. Create or update the downstream bookkeeping issue with the extracted fields, then close this issue.",
        nextOwner: "Bookkeeping Reconciliation",
      };
    case "receivables:extract_fields":
      return {
        currentOwner: "Document Ingestion",
        completionRule:
          "Do not close after extraction alone. Create or update the downstream receivables/bookkeeping issue with the extracted fields, then close this issue.",
        nextOwner: "Bookkeeping Reconciliation",
      };
    case "bookkeeping:auto_post":
      return {
        currentOwner: "Bookkeeping Reconciliation",
        completionRule: "Own the bookkeeping posting and close only when the posting path or blocker is explicit.",
        nextOwner: null,
      };
    case "bookkeeping:needs_review":
      return {
        currentOwner: "Bookkeeping Reconciliation",
        completionRule: "Own the bookkeeping review decision and close only after the review outcome is recorded.",
        nextOwner: null,
      };
    case "receivables:invoice_match":
      return {
        currentOwner: "Bookkeeping Reconciliation",
        completionRule: "Own the receivables match and close only after the matched state or blocker is explicit.",
        nextOwner: null,
      };
    case "reference:contract_review":
      return {
        currentOwner: "Steuerberater Review Copilot",
        completionRule: "Own the contract review and close only when the advisory outcome or blocker is explicit.",
        nextOwner: null,
      };
    default:
      return {
        currentOwner: "Workflow Owner",
        completionRule: "Continue the workflow and leave the next owner explicit before closing.",
        nextOwner: null,
      };
  }
}

function getWorkflowHandoffCommand(contract) {
  if (contract.nextOwner) {
    return `node showcase/scripts/handoff-paperclip-workflow-issue.js --next-owner "${contract.nextOwner}"`;
  }

  return "node showcase/scripts/handoff-paperclip-workflow-issue.js --next-owner \"<owner>\"";
}

function buildPeriodClarificationGuardLines(routeOrPath) {
  const routePath = typeof routeOrPath === "string" ? routeOrPath : routeOrPath?.downstreamPath || routeOrPath?.routeKey;
  if (
    routePath !== "internal_intake"
    && routePath !== "bookkeeping:extract_fields"
    && routePath !== "receivables:extract_fields"
  ) {
    return [];
  }

  return [
    "- periodClarificationRule: Do not open a mandant accounting-period clarification from missing message text alone while a source-linked extraction path is still active. First inspect the linked source document and wait for extraction to confirm whether `bookingMonth` / service-period evidence can be resolved from the file itself.",
    "- staleClarificationRule: If extraction later records `bookingMonth`, `servicePeriodStart`, or `servicePeriodEnd` for the same document, treat any unsent accounting-period clarification or approval branch as stale no-send work and close or supersede it in the same heartbeat.",
  ];
}

function buildIssueDescription({ workflowRun, route }) {
  const contract = getWorkflowContract(route);
  const attachmentAccessRule = route.sourceLink
    ? "Open the Paperclip attachment first. If the attachment is missing in the issue UI, use sourceLink from this description instead of blocking on a re-upload."
    : "The source PDF was not persisted into the runtime yet. Escalate only if both the Paperclip attachment and sourceLink are missing.";
  const handoffCommand = getWorkflowHandoffCommand(contract);

  return [
    "Automatically created from Telegram Mandant intake.",
    "",
    "Source",
    `- submissionId: ${workflowRun.submission.id}`,
    `- documentId: ${route.documentId || "unknown"}`,
    `- fileName: ${route.fileName}`,
    `- sourceLink: ${route.sourceLink || "missing"}`,
    `- documentType: ${route.documentType}`,
    `- status: ${route.status}`,
    `- downstreamPath: ${route.downstreamPath}`,
    `- trigger: ${workflowRun.trigger}`,
    `- sourceLabel: ${workflowRun.source.sourceLabel}`,
    `- workflowRunId: ${workflowRun.id}`,
    `- workflowArtifactPath: ${workflowRun.artifacts?.relativePath || "missing"}`,
    "",
    "Routing",
    `- queue: ${route.queue}`,
    `- reason: ${route.reason}`,
    "",
    "Workflow contract",
    `- currentOwner: ${contract.currentOwner}`,
    `- completionRule: ${contract.completionRule}`,
    `- nextOwner: ${contract.nextOwner || "none"}`,
    `- handoffRule: ${contract.nextOwner
      ? `If ${contract.nextOwner} must continue, create or request that handoff in the same heartbeat before closing. Do not leave the next owner only in prose.`
      : "If new follow-up work appears, either create the follow-up issue or block with the exact owner and action before closing."}`,
    `- attachmentAccess: ${attachmentAccessRule}`,
    `- handoffCommand: ${handoffCommand}`,
    `- handoffAssignmentRule: A handoff is complete only when the downstream issue is created with assigneeAgentId set for the resolved next owner.`,
    "- blockingRule: Do not mark this issue blocked when another internal agent can continue or obtain the missing evidence. Hand it to that agent in the same heartbeat. Reserve `blocked` only for absolute emergencies where files, evidence, or system state may be lost, or when no internal agent can proceed.",
    ...buildPeriodClarificationGuardLines(route),
    "",
    "Paperclip execution",
    "- issueApiAccess: Use the Paperclip heartbeat environment (PAPERCLIP_API_URL, PAPERCLIP_API_KEY, PAPERCLIP_COMPANY_ID, PAPERCLIP_RUN_ID). Do not depend on a local issue-file mirror.",
    `- issueHandoffCommand: ${handoffCommand}`,
    "- missingMappingRule: If the logical next owner cannot be resolved to assigneeAgentId, hand the issue to CTO for routing-map repair instead of creating an unassigned issue. Use `blocked` only if CTO routing is unavailable too.",
    "",
    "Next action",
    `- ${contract.completionRule}`,
    `- ${contract.nextOwner
      ? `Create or request the handoff to ${contract.nextOwner} in the same heartbeat before closing.`
      : "If follow-up work appears, create the follow-up issue or block it explicitly before closing."}`,
    `- ${attachmentAccessRule}`,
  ].join("\n");
}

async function createPaperclipIssue({ activationConfig, workflowRun, route, attachments = [] }) {
  const assignee = await resolveAssigneeAgent(route, activationConfig);
  if (!assignee) {
    throw new Error(`No Paperclip assignee mapping found for route ${route.downstreamPath}`);
  }
  const issue = await createConfiguredPaperclipIssue({
    activationConfig,
    assignee,
    title: buildIssueTitle(route),
    description: buildIssueDescription({ workflowRun, route }),
  });

  await uploadPaperclipAttachments({ activationConfig, issueId: issue.issueId, attachments });

  return {
    stage: ACTIVATION_STAGE,
    route: route.downstreamPath,
    attachments,
    ...issue,
  };
}

function buildWorkflowHandoffLines(workflowHandoff) {
  if (!workflowHandoff) {
    return [];
  }

  const lines = [
    "",
    "Workflow handoff",
    `- workflowRunId: ${workflowHandoff.workflowRunId}`,
    `- workflowArtifactPath: ${workflowHandoff.workflowArtifactPath || "pending"}`,
  ];

  if (Array.isArray(workflowHandoff.activations) && workflowHandoff.activations.length > 0) {
    for (const activation of workflowHandoff.activations) {
      lines.push(
        `- downstreamIssue: ${activation.issueIdentifier || activation.issueId} -> ${activation.assigneeAgentName || "unknown owner"} (${activation.route})`,
      );
    }
    return lines;
  }

  lines.push("- activationMode: downstream_activation_pending_explicit_handoff");
  lines.push("- handoffCommand: node showcase/scripts/handoff-telegram-intake-issue.js");
  if (Array.isArray(workflowHandoff.routes) && workflowHandoff.routes.length > 0) {
    for (const route of workflowHandoff.routes) {
      const contract = getWorkflowContract(route);
      lines.push(
        `- pendingRoute: ${route.downstreamPath} -> ${contract.currentOwner}; documentId=${route.documentId || "unknown"}; sourceLink=${route.sourceLink || "missing"}`,
      );
    }
  } else {
    lines.push("- pendingRoute: unknown");
  }

  return lines;
}

function buildTelegramTicketDescription({
  ticket,
  route,
  intakeResult,
  fallbackReason = null,
  workflowHandoff = null,
}) {
  const workflowContractLines = workflowHandoff?.activations?.length
    ? [
      "Workflow contract",
      "- currentOwner: Mandant Intake",
      "- completionRule: Once intake metadata is persisted and the downstream workflow issue exists, close this intake ticket automatically. Do not hold it for OCR, extraction, or bookkeeping work.",
      `- nextOwner: ${workflowHandoff.activations.map((activation) => activation.assigneeAgentName || activation.issueIdentifier || activation.issueId).join(", ")}`,
      ...buildPeriodClarificationGuardLines("internal_intake"),
    ]
    : [
      "Workflow contract",
      "- currentOwner: Mandant Intake",
      "- completionRule: Persist intake metadata, prepare the intake brief, then create or request the downstream handoff in the same heartbeat. Do not create a parallel downstream issue before the intake owner finishes the brief.",
      "- nextOwner: Document Ingestion after explicit Mandant Intake handoff",
      ...buildPeriodClarificationGuardLines("internal_intake"),
    ];
  const lines = [
    "Automatically created from Telegram webhook intake.",
    "",
    "Ticket contract",
    `- type: ${route.issueTypeLabel}`,
    `- owner: ${route.routeLabel}`,
    `- channel: ${ticket.channel}`,
    `- telegram_chat_id: ${ticket.telegramChatId}`,
    `- telegram_message_id: ${ticket.telegramMessageId}`,
    `- sender: ${ticket.senderName}`,
    `- mandant_id: ${ticket.mandantId || "unmatched"}`,
    `- intent: ${ticket.intent || "none"}`,
    `- received_at: ${ticket.metadata?.receivedAt || new Date().toISOString()}`,
    "",
    "Routing",
    `- selectionMode: ${ticket.metadata?.selectionMode || "unknown"}`,
    `- downstreamPath: ${route.routeKey}`,
    `- unmatchedMandant: ${ticket.unmatchedMandant ? "yes" : "no"}`,
    "",
    ...workflowContractLines,
    "",
    "Message body",
    ticket.messageBody || "[no message body]",
    "",
    "Attachments",
  ];

  if (ticket.attachments.length === 0) {
    lines.push("- none");
  } else {
    for (const attachment of ticket.attachments) {
      lines.push(
        `- ${attachment.kind}: ${attachment.fileName} (${attachment.telegramFileId}); documentId=${attachment.documentId || "pending"}; sourceLink=${attachment.sourceLink || "missing"}`,
      );
    }
  }

  if (intakeResult?.submission?.id) {
    lines.push("", "Document intake");
    lines.push(`- submissionId: ${intakeResult.submission.id}`);
    for (const document of intakeResult.documents) {
      lines.push(
        `- ${document.fileName}: ${document.documentType}, ${document.status}, ${document.id}; sourceLink=${document.sourceLink || "missing"}`,
      );
    }
  }

  lines.push(...buildWorkflowHandoffLines(workflowHandoff));

  if (fallbackReason) {
    lines.push("", "Fallback");
    lines.push(`- fallbackReason: ${fallbackReason}`);
  }

  return lines.join("\n");
}

async function activatePaperclipIssueForTelegramTicket({
  config,
  route,
  ticket,
  intakeResult = null,
  fallbackReason = null,
}) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled) {
    return null;
  }

  const assignee = await resolveAssigneeAgent(route, activationConfig);
  if (!assignee) {
    throw new Error(`No Paperclip assignee mapping found for route ${route.routeKey}`);
  }

  const issue = await createConfiguredPaperclipIssue({
    activationConfig,
    assignee,
    title: ticket.metadata?.issueTitle || `Telegram ${ticket.channel}: ${ticket.telegramMessageId}`,
    description: buildTelegramTicketDescription({ ticket, route, intakeResult, fallbackReason }),
  });

  await uploadPaperclipAttachments({
    activationConfig,
    issueId: issue.issueId,
    attachments: (ticket.attachments || []).filter((entry) => entry.sourceLink),
  });

  return {
    stage: ACTIVATION_STAGE,
    route: route.routeKey,
    issueDescription: buildTelegramTicketDescription({ ticket, route, intakeResult, fallbackReason }),
    ...issue,
  };
}

async function activatePaperclipAgentsForWorkflowRun({ config, workflowRun }) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled) {
    return [];
  }

  const activations = [];
  for (const route of workflowRun.routes) {
    activations.push(
      await createPaperclipIssue({
        activationConfig,
        workflowRun,
        route,
        attachments: route.sourceLink ? [{ fileName: route.fileName, sourceLink: route.sourceLink }] : [],
      }),
    );
  }

  return activations;
}

async function syncTelegramTicketWorkflowDescription({
  config,
  route,
  ticket,
  intakeResult = null,
  workflowRun,
  fallbackReason = null,
}) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled || !ticket?.paperclipIssueId || !workflowRun?.id) {
    return null;
  }

  const description = buildTelegramTicketDescription({
    ticket,
    route,
    intakeResult,
    fallbackReason,
    workflowHandoff: {
      workflowRunId: workflowRun.id,
      workflowArtifactPath: workflowRun.artifacts?.relativePath || null,
      activations: workflowRun.activations || [],
      routes: workflowRun.routes || [],
    },
  });

  return patchPaperclipIssue(activationConfig, ticket.paperclipIssueId, { description });
}

function buildAutoHandoffComment(workflowRun) {
  const downstreamIssues = Array.isArray(workflowRun?.activations) && workflowRun.activations.length > 0
    ? workflowRun.activations
      .map((activation) => activation.issueIdentifier || activation.issueId)
      .join(", ")
    : "none";

  return [
    "**Status:** Automatic Telegram handoff completed.",
    "",
    `**What changed:** Persisted workflow run \`${workflowRun.id}\` and created downstream issue(s): ${downstreamIssues}.`,
    "",
    "**Next action:** Continue only in the downstream workflow issue(s); this intake issue closes automatically after the handoff.",
  ].join("\n");
}

async function completeTelegramTicketWorkflowIssue({
  config,
  route,
  ticket,
  intakeResult = null,
  workflowRun,
  fallbackReason = null,
}) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled || !ticket?.paperclipIssueId || !workflowRun?.id) {
    return null;
  }

  const description = buildTelegramTicketDescription({
    ticket,
    route,
    intakeResult,
    fallbackReason,
    workflowHandoff: {
      workflowRunId: workflowRun.id,
      workflowArtifactPath: workflowRun.artifacts?.relativePath || null,
      activations: workflowRun.activations || [],
      routes: workflowRun.routes || [],
    },
  });

  return patchPaperclipIssue(activationConfig, ticket.paperclipIssueId, {
    description,
    status: "done",
    comment: buildAutoHandoffComment(workflowRun),
  });
}

module.exports = {
  ACTIVATION_STAGE,
  activatePaperclipAgentsForWorkflowRun,
  activatePaperclipIssueForTelegramTicket,
  completeTelegramTicketWorkflowIssue,
  getActivationConfig,
  normalizeLogicalOwnerName,
  resolveAgentForLogicalOwnerName,
  syncTelegramTicketWorkflowDescription,
  uploadPaperclipAttachments,
};
