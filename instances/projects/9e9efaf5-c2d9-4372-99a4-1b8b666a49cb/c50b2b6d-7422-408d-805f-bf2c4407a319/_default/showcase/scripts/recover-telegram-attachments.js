#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");
const { getActivationConfig, uploadPaperclipAttachments } = require("../paperclip-activation");
const { getTelegramBotConfig } = require("../telegram-bots");
const { downloadTelegramAttachment } = require("../telegram-files");

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function getSubmissionIds(argv) {
  const values = argv.filter((value) => value && !value.startsWith("--"));
  if (values.length === 0) {
    throw new Error("Pass one or more Telegram submission IDs.");
  }
  return values;
}

async function loadIssueMaps(activationConfig) {
  const issues = await fetchJson(
    `${activationConfig.apiUrl}/api/companies/${activationConfig.companyId}/issues`,
    {
      headers: {
        Authorization: `Bearer ${activationConfig.apiKey}`,
      },
    },
  );

  return issues.reduce((accumulator, issue) => {
    accumulator.byId.set(issue.id, issue);
    accumulator.byIdentifier.set(issue.identifier, issue);
    return accumulator;
  }, {
    byId: new Map(),
    byIdentifier: new Map(),
  });
}

async function listIssueAttachmentNames(activationConfig, issueId) {
  const attachments = await fetchJson(
    `${activationConfig.apiUrl}/api/issues/${issueId}/attachments`,
    {
      headers: {
        Authorization: `Bearer ${activationConfig.apiKey}`,
      },
    },
  );
  return new Set(
    (attachments || [])
      .map((attachment) => attachment.originalFilename || attachment.fileName)
      .filter(Boolean),
  );
}

async function patchWorkflowArtifact(workflowRunPath, documentId, sourceLink) {
  if (!workflowRunPath) {
    return 0;
  }

  const targets = [
    path.resolve(path.join(__dirname, "..", workflowRunPath)),
    path.resolve(path.join(__dirname, "..", "runtime", "telegram-workflow", "latest.json")),
  ];
  let patchedCount = 0;

  for (const absolutePath of targets) {
    try {
      const contents = await fs.readFile(absolutePath, "utf8");
      const workflowRun = JSON.parse(contents);
      let changed = false;

      workflowRun.routes = (workflowRun.routes || []).map((route) => {
        if (route.documentId !== documentId || route.sourceLink === sourceLink) {
          return route;
        }
        changed = true;
        return {
          ...route,
          sourceLink,
        };
      });

      if (!changed) {
        continue;
      }

      await fs.writeFile(absolutePath, `${JSON.stringify(workflowRun, null, 2)}\n`);
      patchedCount += 1;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return patchedCount;
}

async function main() {
  const submissionIds = getSubmissionIds(process.argv.slice(2));
  const store = await createSharedBuchungsdatenStore();
  const telegramConfig = await getTelegramBotConfig();
  const activationConfig = getActivationConfig({ paperclipActivation: telegramConfig.paperclipActivation });

  if (!activationConfig.enabled) {
    throw new Error("Paperclip activation is not configured in this environment.");
  }

  const issueMaps = await loadIssueMaps(activationConfig);
  const results = [];

  for (const submissionId of submissionIds) {
    const tickets = store.listTelegramMessageTicketsBySubmissionId(submissionId);
    if (tickets.length === 0) {
      results.push({ submissionId, recovered: false, reason: "ticket_not_found" });
      continue;
    }

    const documents = store.listDocuments().filter((document) => document.submissionId === submissionId);
    if (documents.length === 0) {
      results.push({ submissionId, recovered: false, reason: "document_not_found" });
      continue;
    }

    const [ticket] = tickets;
    const bot = telegramConfig.bots[ticket.botKey] || telegramConfig.bots.mandant;
    const recoveredDocuments = [];

    for (const document of documents) {
      let resolvedSourceLink = document.sourceLink;
      const ticketAttachment = (ticket.attachments || []).find(
        (attachment) => attachment.telegramFileId === document.telegramFileId,
      );

      if (!resolvedSourceLink) {
        const downloaded = await downloadTelegramAttachment(bot, {
          telegramFileId: document.telegramFileId,
          fileName: document.fileName,
          mimeType: document.mimeType,
        });
        if (!downloaded?.filePath) {
          recoveredDocuments.push({
            documentId: document.id,
            fileName: document.fileName,
            recovered: false,
            reason: "download_failed",
          });
          continue;
        }

        resolvedSourceLink = downloaded.filePath;
        store.updateTelegramDocumentSource(document.id, {
          sourceLink: resolvedSourceLink,
          rawPayloadPatch: {
            sourceLink: resolvedSourceLink,
            sourceStoragePath: resolvedSourceLink,
          },
        });
      }

      if (ticketAttachment && ticketAttachment.sourceLink !== resolvedSourceLink) {
        store.updateTelegramMessageTicket(ticket.id, {
          attachments: ticket.attachments.map((attachment) => (
            attachment.telegramFileId === document.telegramFileId
              ? { ...attachment, sourceLink: resolvedSourceLink }
              : attachment
          )),
        });
      }

      await patchWorkflowArtifact(ticket.metadata?.workflowRunPath, document.id, resolvedSourceLink);

      const issueIds = new Set();
      if (ticket.paperclipIssueId) {
        issueIds.add(ticket.paperclipIssueId);
      }
      for (const identifier of ticket.metadata?.workflowActivationIssueIdentifiers || []) {
        const issue = issueMaps.byIdentifier.get(identifier);
        if (issue?.id) {
          issueIds.add(issue.id);
        }
      }

      const uploadedTo = [];
      for (const issueId of issueIds) {
        const existingNames = await listIssueAttachmentNames(activationConfig, issueId);
        if (existingNames.has(document.fileName)) {
          uploadedTo.push({ issueId, status: "already_present" });
          continue;
        }

        const uploaded = await uploadPaperclipAttachments({
          activationConfig,
          issueId,
          attachments: [{
            fileName: document.fileName,
            mimeType: document.mimeType,
            sourceLink: resolvedSourceLink,
          }],
        });
        uploadedTo.push({
          issueId,
          status: uploaded.length > 0 ? "uploaded" : "upload_failed",
        });
      }

      recoveredDocuments.push({
        documentId: document.id,
        fileName: document.fileName,
        recovered: true,
        sourceLink: resolvedSourceLink,
        uploadedTo,
      });
    }

    store.addTelegramTicketAuditEvent(ticket.id, "attachment_recovered", {
      submissionId,
      recoveredDocuments: recoveredDocuments.map((item) => ({
        documentId: item.documentId,
        fileName: item.fileName,
        recovered: item.recovered,
      })),
    });
    results.push({
      submissionId,
      ticketId: ticket.id,
      issueIdentifier: ticket.paperclipIssueIdentifier,
      recoveredDocuments,
    });
  }

  await store.save();
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
