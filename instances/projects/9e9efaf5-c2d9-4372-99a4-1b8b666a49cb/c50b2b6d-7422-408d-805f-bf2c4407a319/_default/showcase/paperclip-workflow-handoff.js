const fs = require("node:fs/promises");
const path = require("node:path");
const {
  getActivationConfig,
  normalizeLogicalOwnerName,
  resolveAgentForLogicalOwnerName,
  uploadPaperclipAttachments,
} = require("./paperclip-activation");

function parseArgs(argv) {
  const options = {
    issueId: process.env.PAPERCLIP_TASK_ID || null,
    nextOwner: null,
    summaryFile: null,
    closeComment: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--issue-id") {
      options.issueId = argv[index + 1] || null;
      index += 1;
    } else if (token === "--next-owner") {
      options.nextOwner = argv[index + 1] || null;
      index += 1;
    } else if (token === "--summary-file") {
      options.summaryFile = argv[index + 1] || null;
      index += 1;
    } else if (token === "--close-comment") {
      options.closeComment = argv[index + 1] || null;
      index += 1;
    } else if (!token.startsWith("--")) {
      options.issueId = token;
    }
  }

  return options;
}

function parseKeyValueLine(line) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    key: line.slice(0, separatorIndex).trim(),
    value: line.slice(separatorIndex + 1).trim(),
  };
}

function parseWorkflowIssueDescription(description) {
  const lines = String(description || "").split("\n");
  const sections = {
    Source: {},
    Routing: {},
    "Workflow contract": {},
  };
  let section = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(sections, line)) {
      section = line;
      continue;
    }

    if (!section || !line.startsWith("- ")) {
      continue;
    }

    const parsed = parseKeyValueLine(line.slice(2));
    if (parsed) {
      sections[section][parsed.key] = parsed.value;
    }
  }

  return sections;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Paperclip API request failed with ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchIssue(activationConfig, issueId) {
  return fetchJson(`${activationConfig.apiUrl}/api/issues/${issueId}`, {
    headers: {
      Authorization: `Bearer ${activationConfig.apiKey}`,
    },
  });
}

async function createIssue(activationConfig, payload) {
  return fetchJson(
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
}

async function patchIssue(activationConfig, issueId, payload) {
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

function buildFollowupDescription({
  sourceIssue,
  parsedDescription,
  nextOwner,
  summaryFile,
  summaryProvided,
}) {
  const source = parsedDescription.Source;
  const routing = parsedDescription.Routing;
  const workflow = parsedDescription["Workflow contract"];

  return [
    "Automatically created by workflow handoff.",
    "",
    "Handoff",
    `- sourceIssue: ${sourceIssue.identifier || sourceIssue.id}`,
    `- sourceTitle: ${sourceIssue.title}`,
    `- previousOwner: ${workflow.currentOwner || "unknown"}`,
    `- nextOwner: ${nextOwner.assigneeAgentName}`,
    `- sourceIssueId: ${sourceIssue.id}`,
    `- handoffSummaryFile: ${summaryFile || "none"}`,
    `- handoffSummaryProvided: ${summaryProvided ? "yes" : "no"}`,
    "",
    "Source",
    ...Object.entries(source).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Routing",
    ...Object.entries(routing).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "Workflow contract",
    `- currentOwner: ${nextOwner.assigneeAgentName}`,
    "- completionRule: Continue the handed-off work and create or request the next handoff in the same heartbeat before closing.",
    "- nextOwner: none",
    "- handoffRule: If another owner must continue, run the workflow handoff command with the target owner and any supporting summary file before closing.",
    "- blockingRule: Do not mark this issue blocked when another internal agent can continue or obtain the missing evidence. Hand it to that agent in the same heartbeat. Reserve `blocked` only for absolute emergencies where files, evidence, or system state may be lost, or when no internal agent can proceed.",
    '- handoffCommand: node showcase/scripts/handoff-paperclip-workflow-issue.js --next-owner "<owner>"',
    "",
    "Upstream context",
    sourceIssue.description || "[no upstream description]",
  ].join("\n");
}

async function rerouteIssueForMissingMapping({
  activationConfig,
  sourceIssue,
  requestedNextOwner,
  logicalNextOwner,
}) {
  const mappingName = logicalNextOwner || requestedNextOwner || "unknown";
  const ctoAgent = await resolveAgentForLogicalOwnerName(activationConfig, "CTO");
  if (ctoAgent?.assigneeAgentId) {
    const comment = [
      "**Status:** Routed to CTO for workflow owner mapping repair.",
      "",
      `**What changed:** Could not resolve \`${mappingName}\` to a downstream \`assigneeAgentId\`, so I did not create an unassigned issue or leave this blocked.`,
      "",
      `**Next action:** CTO should add or repair the routing for \`${mappingName}\`, then hand this issue to the intended downstream owner.`,
    ].join("\n");

    await patchIssue(activationConfig, sourceIssue.id, {
      assigneeAgentId: ctoAgent.assigneeAgentId,
      status: "todo",
      comment,
    });

    return {
      routedToCto: true,
      sourceIssueId: sourceIssue.id,
      sourceIssueIdentifier: sourceIssue.identifier || null,
      missingMapping: mappingName,
      assigneeAgentId: ctoAgent.assigneeAgentId,
    };
  }

  const comment = [
    "**Status:** Blocked on missing workflow owner mapping.",
    "",
    `**What changed:** Could not resolve \`${mappingName}\` to a downstream \`assigneeAgentId\`, and CTO routing is unavailable too, so no safe handoff owner exists.`,
    "",
    `**Unblock needed:** Restore CTO routing or add/fix the mapping for \`${mappingName}\` so the handoff can be created with \`assigneeAgentId\` set.`,
  ].join("\n");

  await patchIssue(activationConfig, sourceIssue.id, {
    status: "blocked",
    comment,
  });

  return {
    blocked: true,
    sourceIssueId: sourceIssue.id,
    sourceIssueIdentifier: sourceIssue.identifier || null,
    missingMapping: mappingName,
  };
}

async function executePaperclipWorkflowHandoff({
  config = {
    paperclipActivation: {
      enabled: "1",
      allowHeartbeatContext: "1",
    },
  },
  issueId = process.env.PAPERCLIP_TASK_ID,
  nextOwner = null,
  summaryFile = null,
  closeComment = null,
} = {}) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled) {
    throw new Error("Paperclip activation is not enabled for workflow handoff.");
  }
  if (!issueId) {
    throw new Error("Missing Paperclip issue id for workflow handoff.");
  }

  const sourceIssue = await fetchIssue(activationConfig, issueId);
  const parsedDescription = parseWorkflowIssueDescription(sourceIssue.description);
  const requestedNextOwner = nextOwner || parsedDescription["Workflow contract"].nextOwner;
  if (!requestedNextOwner || requestedNextOwner === "none") {
    throw new Error("Workflow handoff requires --next-owner when the issue does not declare a next owner.");
  }
  const logicalNextOwner = normalizeLogicalOwnerName(requestedNextOwner);
  if (!logicalNextOwner || logicalNextOwner === "none") {
    throw new Error(`Workflow handoff requires a logical next owner, received: ${requestedNextOwner}`);
  }

  const nextAgent = await resolveAgentForLogicalOwnerName(activationConfig, logicalNextOwner);
  if (!nextAgent) {
    return rerouteIssueForMissingMapping({
      activationConfig,
      sourceIssue,
      requestedNextOwner,
      logicalNextOwner,
    });
  }

  let resolvedSummaryFile = null;
  if (summaryFile) {
    resolvedSummaryFile = path.resolve(summaryFile);
    await fs.stat(resolvedSummaryFile);
  }

  const followupDescription = buildFollowupDescription({
    sourceIssue,
    parsedDescription,
    nextOwner: nextAgent,
    summaryFile: resolvedSummaryFile,
    summaryProvided: Boolean(resolvedSummaryFile),
  });

  const followupIssue = await createIssue(activationConfig, {
    title: sourceIssue.title,
    description: followupDescription,
    status: "todo",
    priority: sourceIssue.priority || "medium",
    assigneeAgentId: nextAgent.assigneeAgentId,
    projectId: sourceIssue.projectId || null,
    goalId: sourceIssue.goalId || null,
    parentId: sourceIssue.id,
  });

  if (!nextAgent.assigneeAgentId) {
    return rerouteIssueForMissingMapping({
      activationConfig,
      sourceIssue,
      requestedNextOwner,
      logicalNextOwner,
    });
  }

  if (resolvedSummaryFile) {
    await uploadPaperclipAttachments({
      activationConfig,
      issueId: followupIssue.id,
      attachments: [{
        fileName: path.basename(resolvedSummaryFile),
        sourceLink: resolvedSummaryFile,
      }],
    });
  }

  await patchIssue(activationConfig, sourceIssue.id, {
    status: "done",
    comment: closeComment || [
      "**Status:** Workflow handoff completed.",
      "",
      `**What changed:** Created downstream issue \`${followupIssue.identifier || followupIssue.id}\` for ${nextAgent.assigneeAgentName}.`,
      "",
      `**Next action:** Continue in \`${followupIssue.identifier || followupIssue.id}\`.`,
    ].join("\n"),
  });

  return {
    sourceIssueId: sourceIssue.id,
    sourceIssueIdentifier: sourceIssue.identifier || null,
    followupIssueId: followupIssue.id,
    followupIssueIdentifier: followupIssue.identifier || null,
    nextOwner: nextAgent.assigneeAgentName,
    assigneeAgentId: nextAgent.assigneeAgentId,
    summaryFile: resolvedSummaryFile,
  };
}

module.exports = {
  executePaperclipWorkflowHandoff,
  parseArgs,
  parseWorkflowIssueDescription,
};
