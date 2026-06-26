const fs = require("node:fs/promises");
const path = require("node:path");
const {
  activatePaperclipAgentsForWorkflowRun,
  completeTelegramTicketWorkflowIssue,
  getActivationConfig,
} = require("./paperclip-activation");
const { writeTelegramWorkflowRun } = require("./telegram-workflow");

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

function parseAttachmentLine(line) {
  const match = /^- ([^:]+): (.+) \((.+)\); documentId=(.+?); sourceLink=(.+)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    kind: match[1],
    fileName: match[2],
    telegramFileId: match[3],
    documentId: match[4],
    sourceLink: match[5],
  };
}

function parseDocumentIntakeLine(line) {
  const match = /^- (.+): ([^,]+), ([^,]+), ([^;]+); sourceLink=(.+)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    fileName: match[1],
    documentType: match[2],
    status: match[3],
    id: match[4],
    sourceLink: match[5],
  };
}

function parseIssueDescription(description, issueTitle) {
  const lines = String(description || "").split("\n");
  const ticket = {
    channel: null,
    telegramChatId: null,
    telegramMessageId: null,
    senderName: null,
    mandantId: null,
    unmatchedMandant: false,
    intent: null,
    messageBody: "",
    attachments: [],
    metadata: {
      receivedAt: null,
      selectionMode: null,
      issueTitle,
    },
  };
  const intakeResult = {
    submission: {
      id: null,
    },
    documents: [],
  };
  const route = {
    routeKey: "internal_intake",
    routeLabel: "Mandant Intake",
    issueTypeLabel: "internal_intake",
    selectionMode: null,
  };
  let workflowArtifactPath = null;
  let section = null;
  let messageBodyLines = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    if (line === "Ticket contract" || line === "Routing" || line === "Message body" || line === "Attachments"
      || line === "Document intake" || line === "Workflow handoff") {
      section = line;
      continue;
    }

    if (section === "Ticket contract" || section === "Routing" || section === "Workflow handoff" || section === "Document intake") {
      const parsed = parseKeyValueLine(line.replace(/^- /, ""));
      if (!parsed) {
        if (section === "Document intake") {
          const document = parseDocumentIntakeLine(line);
          if (document) {
            intakeResult.documents.push(document);
          }
        }
        continue;
      }

      const { key, value } = parsed;
      if (section === "Ticket contract") {
        if (key === "type") {
          route.issueTypeLabel = value;
        } else if (key === "owner") {
          route.routeLabel = value;
        } else if (key === "channel") {
          ticket.channel = value;
        } else if (key === "telegram_chat_id") {
          ticket.telegramChatId = value;
        } else if (key === "telegram_message_id") {
          ticket.telegramMessageId = value;
        } else if (key === "sender") {
          ticket.senderName = value;
        } else if (key === "mandant_id") {
          ticket.mandantId = value;
        } else if (key === "intent") {
          ticket.intent = value;
        } else if (key === "received_at") {
          ticket.metadata.receivedAt = value;
        }
      } else if (section === "Routing") {
        if (key === "selectionMode") {
          ticket.metadata.selectionMode = value;
          route.selectionMode = value;
        } else if (key === "downstreamPath") {
          route.routeKey = value;
        } else if (key === "unmatchedMandant") {
          ticket.unmatchedMandant = value === "yes";
        }
      } else if (section === "Document intake") {
        if (key === "submissionId") {
          intakeResult.submission.id = value;
        }
      } else if (section === "Workflow handoff" && key === "workflowArtifactPath") {
        workflowArtifactPath = value;
      }
      continue;
    }

    if (section === "Message body") {
      messageBodyLines.push(line);
      continue;
    }

    if (section === "Attachments") {
      const attachment = parseAttachmentLine(line);
      if (attachment) {
        ticket.attachments.push(attachment);
      }
    }
  }

  ticket.messageBody = messageBodyLines.join("\n").trim();
  if (ticket.messageBody === "[no message body]") {
    ticket.messageBody = "";
  }

  return {
    route,
    ticket,
    intakeResult,
    workflowArtifactPath,
  };
}

async function fetchIssue(activationConfig, issueId) {
  const response = await fetch(`${activationConfig.apiUrl}/api/issues/${issueId}`, {
    headers: {
      Authorization: `Bearer ${activationConfig.apiKey}`,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Failed to load Paperclip issue ${issueId}: ${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function resolveWorkflowArtifactPath(showcaseDir, workflowArtifactPath) {
  if (!workflowArtifactPath) {
    throw new Error("Missing workflowArtifactPath in issue description.");
  }

  if (path.isAbsolute(workflowArtifactPath)) {
    return workflowArtifactPath;
  }

  if (workflowArtifactPath.startsWith("./runtime/")) {
    const runtimeDir = process.env.SHOWCASE_RUNTIME_DIR || path.join(showcaseDir, "runtime");
    return path.join(runtimeDir, workflowArtifactPath.slice("./runtime/".length));
  }

  return path.resolve(showcaseDir, workflowArtifactPath);
}

async function executeTelegramIntakeHandoff({
  config = {
    paperclipActivation: {
      enabled: "1",
      allowHeartbeatContext: "1",
    },
  },
  issueId = process.env.PAPERCLIP_TASK_ID,
  showcaseDir = __dirname,
} = {}) {
  const activationConfig = getActivationConfig(config);
  if (!activationConfig.enabled) {
    throw new Error("Paperclip activation is not enabled for Telegram intake handoff.");
  }
  if (!issueId) {
    throw new Error("Missing Paperclip issue id for Telegram intake handoff.");
  }

  const issue = await fetchIssue(activationConfig, issueId);
  const parsed = parseIssueDescription(issue.description, issue.title);
  parsed.ticket.paperclipIssueId = issue.id;
  parsed.ticket.paperclipIssueIdentifier = issue.identifier || null;
  const workflowFilePath = resolveWorkflowArtifactPath(showcaseDir, parsed.workflowArtifactPath);
  const workflowRun = JSON.parse(await fs.readFile(workflowFilePath, "utf8"));
  const activations = Array.isArray(workflowRun.activations) && workflowRun.activations.length > 0
    ? workflowRun.activations
    : await activatePaperclipAgentsForWorkflowRun({
      config,
      workflowRun,
    });

  const updatedWorkflowRun = await writeTelegramWorkflowRun({
    ...workflowRun,
    activations,
  });

  await completeTelegramTicketWorkflowIssue({
    config,
    route: parsed.route,
    ticket: parsed.ticket,
    intakeResult: parsed.intakeResult,
    workflowRun: updatedWorkflowRun,
  });

  return {
    issueId: issue.id,
    issueIdentifier: issue.identifier || null,
    workflowRunId: updatedWorkflowRun.id,
    activationCount: activations.length,
    activationIssueIdentifiers: activations
      .map((activation) => activation.issueIdentifier)
      .filter(Boolean),
  };
}

module.exports = {
  executeTelegramIntakeHandoff,
  parseIssueDescription,
};
