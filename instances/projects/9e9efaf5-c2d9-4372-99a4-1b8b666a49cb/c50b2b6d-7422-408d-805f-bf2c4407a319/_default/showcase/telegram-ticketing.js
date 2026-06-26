const { normalizeTelegramSubmission } = require("./telegram-intake");
const {
  buildTicketTitle,
  extractTelegramEnvelope,
  resolveFallbackRoute,
  resolveMandantMatch,
  resolveTelegramRoute,
} = require("./telegram-routing");
const {
  activatePaperclipIssueForTelegramTicket,
  syncTelegramTicketWorkflowDescription,
} = require("./paperclip-activation");
const {
  createTelegramWorkflowRun,
  writeTelegramWorkflowRun,
} = require("./telegram-workflow");
const { downloadTelegramAttachments } = require("./telegram-files");

function mergeAttachmentRefs(attachments, intakeResult) {
  if (!intakeResult?.documents?.length) {
    return attachments;
  }

  return attachments.map((attachment) => {
    const linkedDocument = intakeResult.documents.find(
      (document) => document.telegramFileId && document.telegramFileId === attachment.telegramFileId,
    );
    if (!linkedDocument) {
      return attachment;
    }

    return {
      ...attachment,
      documentId: linkedDocument.id,
      submissionId: intakeResult.submission.id,
      sourceLink: linkedDocument.sourceLink || null,
    };
  });
}

async function processTelegramInboundMessage({
  botKey,
  update,
  store,
  chartType = "SKR03",
  config,
  bot,
}) {
  const envelope = extractTelegramEnvelope(botKey, update);
  const downloadedAttachments = await downloadTelegramAttachments(bot, envelope.attachments);
  for (const attachment of envelope.attachments) {
    const stored = downloadedAttachments.get(attachment.telegramFileId);
    if (stored?.filePath) {
      attachment.sourceLink = stored.filePath;
    }
  }
  const existing = store.getTelegramMessageTicketByMessageId(envelope.telegramMessageId);
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      ticket: existing,
      auditEvents: store.listTelegramTicketAuditEvents(existing.id),
    };
  }

  const mandantMatch = resolveMandantMatch({
    envelope,
    store,
    defaultMandantId: botKey === "mandant" ? config.defaultMandantId : null,
  });
  const route = resolveTelegramRoute(envelope);
  const metadata = {
    receivedAt: envelope.receivedAt,
    selectionMode: route.selectionMode,
    matchMode: mandantMatch.matchMode,
    matchedOn: mandantMatch.matchedOn,
    issueTitle: buildTicketTitle(envelope, route),
  };

  let ticket = store.createTelegramMessageTicket({
    telegramMessageId: envelope.telegramMessageId,
    telegramUpdateId: envelope.telegramUpdateId,
    channel: envelope.channel,
    botKey: envelope.botKey,
    telegramChatId: envelope.telegramChatId,
    senderName: envelope.senderName,
    senderUsername: envelope.senderUsername,
    messageBody: envelope.messageBody,
    messageType: envelope.messageType,
    mandantId: mandantMatch.mandantId,
    unmatchedMandant: mandantMatch.unmatchedMandant,
    intent: route.intent,
    intentConfidence: route.intentConfidence,
    routeKey: route.routeKey,
    routeLabel: route.routeLabel,
    downstreamPath: route.issueTypeLabel,
    issueTypeLabel: route.issueTypeLabel,
    assigneeAgentName: route.routeLabel,
    attachments: envelope.attachments,
    metadata,
    rawUpdate: envelope.rawUpdate,
    fallbackUsed: route.fallbackUsed,
  });
  store.addTelegramTicketAuditEvent(ticket.id, "message_received", {
    channel: ticket.channel,
    messageType: ticket.messageType,
    attachmentCount: ticket.attachments.length,
  });
  store.addTelegramTicketAuditEvent(ticket.id, "route_selected", {
    routeKey: route.routeKey,
    routeLabel: route.routeLabel,
    selectionMode: route.selectionMode,
    intent: route.intent,
    intentConfidence: route.intentConfidence,
  });

  let intakeResult = null;
  let activation = null;
  let workflowRun = null;

  try {
    if (envelope.attachments.length > 0 && mandantMatch.mandantId) {
      const submission = normalizeTelegramSubmission({
        mandantId: mandantMatch.mandantId,
        sourceLabel: `${bot.username || bot.key} webhook`,
        ...update,
      }, { downloadedAttachments });
      intakeResult = store.ingestTelegramSubmission(submission, chartType);
      ticket = store.updateTelegramMessageTicket(ticket.id, {
        submissionId: intakeResult.submission.id,
        attachments: mergeAttachmentRefs(ticket.attachments, intakeResult),
        metadata: {
          ...ticket.metadata,
          submissionId: intakeResult.submission.id,
          documentIds: intakeResult.documents.map((document) => document.id),
        },
      });
      store.addTelegramTicketAuditEvent(ticket.id, "intake_persisted", {
        submissionId: intakeResult.submission.id,
        documentCount: intakeResult.documents.length,
      });
    } else if (envelope.attachments.length > 0 && !mandantMatch.mandantId) {
      store.addTelegramTicketAuditEvent(ticket.id, "intake_skipped_unmatched_mandant", {
        attachmentCount: envelope.attachments.length,
      });
    }

    activation = await activatePaperclipIssueForTelegramTicket({
      config,
      route,
      ticket,
      intakeResult,
    });
    if (activation) {
      ticket = store.updateTelegramMessageTicket(ticket.id, {
        assigneeAgentId: activation.assigneeAgentId,
        assigneeAgentName: activation.assigneeAgentName,
        paperclipIssueId: activation.issueId,
        paperclipIssueIdentifier: activation.issueIdentifier,
      });
      store.addTelegramTicketAuditEvent(ticket.id, "paperclip_issue_created", {
        issueId: activation.issueId,
        issueIdentifier: activation.issueIdentifier,
        assigneeAgentName: activation.assigneeAgentName,
        routeKey: route.routeKey,
      });
    }

    if (route.routeKey === "internal_intake" && intakeResult?.documents?.length) {
      const workflowRunDraft = createTelegramWorkflowRun(intakeResult, {
        chartType,
        trigger: "telegram_webhook",
        botKey: bot.key,
      });
      workflowRun = await writeTelegramWorkflowRun(workflowRunDraft);
      workflowRun = await writeTelegramWorkflowRun({
        ...workflowRun,
        activations: [],
      });
      ticket = store.updateTelegramMessageTicket(ticket.id, {
        metadata: {
          ...ticket.metadata,
          workflowRunId: workflowRun.id,
          workflowRunPath: workflowRun.artifacts?.relativePath || null,
          workflowActivationIssueIdentifiers: [],
        },
      });
      store.addTelegramTicketAuditEvent(ticket.id, "workflow_handoff_prepared", {
        workflowRunId: workflowRun.id,
        workflowRunPath: workflowRun.artifacts?.relativePath || null,
        routeCount: workflowRun.routes.length,
        activationCount: 0,
        activationMode: "explicit_mandant_handoff_required",
      });
      try {
        await syncTelegramTicketWorkflowDescription({
          config,
          route,
          ticket,
          intakeResult,
          workflowRun,
        });
      } catch (error) {
        store.addTelegramTicketAuditEvent(ticket.id, "workflow_handoff_sync_failed", {
          issueId: ticket.paperclipIssueId,
          error: error.message,
        });
      }
    }

    await store.save();

    return {
      ok: true,
      duplicate: false,
      route,
      ticket,
      intake: intakeResult,
      activation,
      workflowRun,
      auditEvents: store.listTelegramTicketAuditEvents(ticket.id),
    };
  } catch (error) {
    store.addTelegramTicketAuditEvent(ticket.id, "processing_failed", {
      error: error.message,
      routeKey: route.routeKey,
    });

    const fallbackRoute = resolveFallbackRoute();
    let fallbackActivation = null;
    try {
      fallbackActivation = await activatePaperclipIssueForTelegramTicket({
        config,
        route: fallbackRoute,
        ticket,
        intakeResult,
        fallbackReason: error.message,
      });
    } catch (fallbackError) {
      ticket = store.updateTelegramMessageTicket(ticket.id, {
        processingError: `${error.message}; fallback failed: ${fallbackError.message}`,
        fallbackUsed: true,
      });
      store.addTelegramTicketAuditEvent(ticket.id, "fallback_issue_failed", {
        error: fallbackError.message,
      });
      await store.save();
      throw fallbackError;
    }

    ticket = store.updateTelegramMessageTicket(ticket.id, {
      assigneeAgentId: fallbackActivation?.assigneeAgentId || ticket.assigneeAgentId,
      assigneeAgentName: fallbackActivation?.assigneeAgentName || "CEO",
      paperclipIssueId: fallbackActivation?.issueId || ticket.paperclipIssueId,
      paperclipIssueIdentifier: fallbackActivation?.issueIdentifier || ticket.paperclipIssueIdentifier,
      processingError: error.message,
      fallbackUsed: true,
      metadata: {
        ...ticket.metadata,
        fallbackReason: error.message,
        fallbackRouteKey: fallbackRoute.routeKey,
      },
    });
    store.addTelegramTicketAuditEvent(ticket.id, "fallback_issue_created", {
      issueId: fallbackActivation?.issueId || null,
      issueIdentifier: fallbackActivation?.issueIdentifier || null,
      assigneeAgentName: fallbackActivation?.assigneeAgentName || "CEO",
      fallbackReason: error.message,
    });
    await store.save();

    return {
      ok: true,
      duplicate: false,
      route,
      fallbackRoute,
      fallbackUsed: true,
      ticket,
      intake: intakeResult,
      activation: fallbackActivation,
      auditEvents: store.listTelegramTicketAuditEvents(ticket.id),
    };
  }
}

module.exports = {
  processTelegramInboundMessage,
};
