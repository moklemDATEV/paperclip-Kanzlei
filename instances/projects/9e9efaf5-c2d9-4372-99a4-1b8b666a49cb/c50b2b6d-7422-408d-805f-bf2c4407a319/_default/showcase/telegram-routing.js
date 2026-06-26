const { randomUUID } = require("node:crypto");

const ROUTING_RULES = [
  {
    routeKey: "internal_intake",
    routeLabel: "Mandant Intake",
    assigneeUrlKey: "mandant-intake",
    issueTypeLabel: "internal_intake",
    mentionTokens: ["@intake"],
    intentKeywords: ["intake", "eingang", "submission", "submit", "mandant"],
  },
  {
    routeKey: "doc_processing",
    routeLabel: "Document Ingestion",
    assigneeUrlKey: "document-ingestion",
    issueTypeLabel: "doc_processing",
    mentionTokens: ["@docs"],
    intentKeywords: ["document", "documents", "invoice", "receipt", "beleg", "rechnung", "ocr", "scan", "pdf"],
  },
  {
    routeKey: "reconciliation",
    routeLabel: "Bookkeeping Reconciliation",
    assigneeUrlKey: "bookkeeping-reconciliation",
    issueTypeLabel: "reconciliation",
    mentionTokens: ["@reco"],
    intentKeywords: ["reconcile", "reconciliation", "match", "abgleichen", "buchung", "bank", "konto"],
  },
  {
    routeKey: "tax_draft",
    routeLabel: "Tax Preparation",
    assigneeUrlKey: "tax-preparation",
    issueTypeLabel: "tax_draft",
    mentionTokens: ["@tax"],
    intentKeywords: ["tax", "steuer", "ustva", "vat", "umsatzsteuer"],
  },
  {
    routeKey: "compliance_check",
    routeLabel: "Compliance Guard",
    assigneeUrlKey: "compliance-guard",
    issueTypeLabel: "compliance_check",
    mentionTokens: ["@compliance"],
    intentKeywords: ["compliance", "policy", "approval", "approve", "gate", "freigabe"],
  },
  {
    routeKey: "review_package",
    routeLabel: "Steuerberater Review Copilot",
    assigneeUrlKey: "steuerberater-review-copilot",
    issueTypeLabel: "review_package",
    mentionTokens: ["@review"],
    intentKeywords: ["review", "advisor", "steuerberater", "final check", "review_queue"],
  },
  {
    routeKey: "outbound_request",
    routeLabel: "Client Communication",
    assigneeUrlKey: "client-communication",
    issueTypeLabel: "outbound_request",
    mentionTokens: ["@outbound"],
    intentKeywords: ["reply", "respond", "send to client", "outbound", "antwort", "client"],
  },
  {
    routeKey: "tech",
    routeLabel: "CTO",
    assigneeUrlKey: "cto",
    issueTypeLabel: "tech",
    mentionTokens: ["@cto"],
    intentKeywords: ["bug", "technical", "tech", "api", "webhook", "deploy", "infra", "error"],
  },
];

const TRIAGE_ROUTE = {
  routeKey: "triage",
  routeLabel: "CEO",
  assigneeUrlKey: "ceo",
  issueTypeLabel: "triage",
};

function normalizeName(value) {
  return (value || "")
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function tokenize(value) {
  return normalizeName(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function getMessage(update) {
  return update.message || update.edited_message || null;
}

function detectMessageType(message) {
  if (!message) {
    return "unsupported_update";
  }
  if (typeof message.text === "string" && message.text.trim().startsWith("/")) {
    return "command";
  }
  if (message.document) {
    return "document";
  }
  if (Array.isArray(message.photo) && message.photo.length > 0) {
    return "photo";
  }
  if (typeof message.text === "string" && message.text.trim()) {
    return "text";
  }
  if (typeof message.caption === "string" && message.caption.trim()) {
    return "caption";
  }
  return "unknown";
}

function extractAttachments(message) {
  const attachments = [];

  if (message?.document) {
    attachments.push({
      kind: "document",
      telegramFileId: message.document.file_id,
      fileName: message.document.file_name || `telegram-document-${message.document.file_id}`,
      mimeType: message.document.mime_type || "application/octet-stream",
      fileSize: message.document.file_size || null,
    });
  }

  if (Array.isArray(message?.photo) && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1];
    attachments.push({
      kind: "photo",
      telegramFileId: photo.file_id,
      fileName: `telegram-photo-${photo.file_id}.jpg`,
      mimeType: "image/jpeg",
      fileSize: photo.file_size || null,
      width: photo.width || null,
      height: photo.height || null,
    });
  }

  return attachments;
}

function buildMessageBody(message) {
  if (!message) {
    return "[Unsupported telegram update payload]";
  }

  return [message.text, message.caption]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n")
    .trim();
}

function extractTelegramEnvelope(botKey, update) {
  const message = getMessage(update);
  const attachments = extractAttachments(message);
  const senderName = message?.from?.username
    || [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ")
    || "Unknown sender";
  const senderUsername = message?.from?.username || null;
  const receivedAt = typeof message?.date === "number"
    ? new Date(message.date * 1000).toISOString()
    : new Date().toISOString();

  return {
    id: randomUUID(),
    channel: botKey,
    botKey,
    telegramUpdateId: update.update_id != null ? String(update.update_id) : null,
    telegramMessageId: message?.message_id != null
      ? String(message.message_id)
      : `update-${update.update_id || randomUUID()}`,
    telegramChatId: message?.chat?.id != null ? String(message.chat.id) : "unknown-chat",
    senderName,
    senderUsername,
    senderDisplay: senderUsername ? `@${senderUsername}` : senderName,
    messageType: detectMessageType(message),
    messageBody: buildMessageBody(message),
    attachments,
    receivedAt,
    chatTitle: message?.chat?.title || message?.chat?.username || null,
    rawUpdate: update,
  };
}

function findExplicitRoute(messageBody) {
  const lower = (messageBody || "").toLowerCase();
  return ROUTING_RULES.find((rule) => rule.mentionTokens.some((token) => lower.includes(token))) || null;
}

function detectIntent(messageBody) {
  const lower = normalizeName(messageBody);
  if (!lower) {
    return null;
  }

  let best = null;
  for (const rule of ROUTING_RULES) {
    const matches = rule.intentKeywords.filter((keyword) => lower.includes(normalizeName(keyword)));
    if (matches.length === 0) {
      continue;
    }

    const candidate = {
      routeKey: rule.routeKey,
      confidence: Math.min(0.95, 0.35 + matches.length * 0.15),
      matches,
      rule,
    };
    if (!best || candidate.matches.length > best.matches.length) {
      best = candidate;
    }
  }

  return best;
}

function resolveTelegramRoute(envelope) {
  if (envelope.channel === "mandant") {
    const rule = ROUTING_RULES.find((item) => item.routeKey === "internal_intake");
    return {
      ...rule,
      intent: "mandant_default",
      intentConfidence: 1,
      selectionMode: "channel_default",
      fallbackUsed: false,
    };
  }

  const explicit = findExplicitRoute(envelope.messageBody);
  if (explicit) {
    return {
      ...explicit,
      intent: explicit.routeKey,
      intentConfidence: 1,
      selectionMode: "explicit_mention",
      fallbackUsed: false,
    };
  }

  const intent = detectIntent(envelope.messageBody);
  if (intent && intent.confidence >= 0.45) {
    return {
      ...intent.rule,
      intent: intent.routeKey,
      intentConfidence: intent.confidence,
      selectionMode: "intent_recognition",
      fallbackUsed: false,
    };
  }

  return {
    ...TRIAGE_ROUTE,
    intent: intent?.routeKey || null,
    intentConfidence: intent?.confidence || 0.2,
    selectionMode: "ceo_fallback",
    fallbackUsed: true,
  };
}

function resolveFallbackRoute() {
  return {
    ...TRIAGE_ROUTE,
    intent: "fallback_error",
    intentConfidence: 1,
    selectionMode: "fallback_error",
    fallbackUsed: true,
  };
}

function scoreMandantMatch(mandant, candidates) {
  const names = [mandant.legalName, mandant.displayName].map(normalizeName).filter(Boolean);
  const candidateTokens = new Set(candidates.flatMap((value) => tokenize(value)));
  let score = 0;

  for (const name of names) {
    if (!name) {
      continue;
    }
    if (candidates.some((candidate) => normalizeName(candidate).includes(name))) {
      score += 10;
      continue;
    }

    const nameTokens = tokenize(name);
    const overlap = nameTokens.filter((token) => candidateTokens.has(token)).length;
    score += overlap;
  }

  return score;
}

function resolveMandantMatch({ envelope, store, defaultMandantId }) {
  if (defaultMandantId && store.getMandant(defaultMandantId)) {
    return {
      mandantId: defaultMandantId,
      unmatchedMandant: false,
      matchMode: "configured_default",
      matchedOn: defaultMandantId,
    };
  }

  const mandanten = store.listMandanten();
  const candidates = [
    envelope.senderName,
    envelope.senderUsername,
    envelope.chatTitle,
    envelope.messageBody,
  ].filter(Boolean);

  let best = null;
  for (const mandant of mandanten) {
    const score = scoreMandantMatch(mandant, candidates);
    if (!best || score > best.score) {
      best = { mandant, score };
    }
  }

  if (best && best.score >= 2) {
    return {
      mandantId: best.mandant.id,
      unmatchedMandant: false,
      matchMode: "fuzzy_match",
      matchedOn: best.mandant.displayName,
    };
  }

  return {
    mandantId: null,
    unmatchedMandant: true,
    matchMode: "unmatched",
    matchedOn: null,
  };
}

function buildTicketTitle(envelope, route) {
  const subject = envelope.attachments[0]?.fileName
    || envelope.messageBody.split("\n")[0]
    || `${envelope.channel} message`;
  return `Telegram ${envelope.channel}: ${subject.slice(0, 72)}`;
}

module.exports = {
  ROUTING_RULES,
  TRIAGE_ROUTE,
  buildTicketTitle,
  extractTelegramEnvelope,
  resolveFallbackRoute,
  resolveMandantMatch,
  resolveTelegramRoute,
};
