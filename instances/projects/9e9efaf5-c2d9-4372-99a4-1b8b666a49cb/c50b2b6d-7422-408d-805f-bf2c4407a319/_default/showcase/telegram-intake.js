const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");

const DOCUMENT_TYPES = [
  "supplier_invoice",
  "customer_invoice",
  "receipt",
  "contract",
];

const STATUS_VALUES = ["ready", "needs_review", "reference_only"];
const DIRECTION_VALUES = ["expense", "revenue", "agreement"];

const COUNTERPARTY_RULES = [
  {
    matchers: ["amazon"],
    counterparty: "Amazon EU S.a r.l.",
    purposeKey: "OFFICE_SUPPLIES",
  },
  {
    matchers: ["telekom"],
    counterparty: "Telekom Deutschland GmbH",
    purposeKey: "TELECOM",
  },
  {
    matchers: ["metro"],
    counterparty: "Metro Deutschland GmbH",
    purposeKey: "TEAM_EVENT_REVIEW",
  },
  {
    matchers: ["stadtwerke"],
    counterparty: "Stadtwerke Koeln",
    purposeKey: "UTILITIES",
  },
  {
    matchers: ["van4event", "van rental"],
    counterparty: "Van4Event GmbH",
    purposeKey: "VEHICLE_RENTAL",
  },
  {
    matchers: ["eventhaus"],
    counterparty: "Eventhaus Bonn GmbH",
    purposeKey: "REVENUE_19",
  },
  {
    matchers: ["hochzeit mayer"],
    counterparty: "Hochzeit Mayer GbR",
    purposeKey: "REVENUE_19",
  },
  {
    matchers: ["messebau rhein"],
    counterparty: "Messebau Rhein AG",
    purposeKey: "REVENUE_19",
  },
];

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function parseNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return roundCurrency(value);
  }
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : null;
}

function normalizeText(value) {
  return (value || "").toString().trim();
}

function keywordHaystack(values) {
  return values
    .filter(Boolean)
    .map((value) => value.toString().toLowerCase())
    .join(" ");
}

function normalizedKeywordHaystack(values) {
  return normalizeText(values.filter(Boolean).join(" "))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function inferSourceText(raw) {
  const existingText = normalizeText(raw.textContent);
  if (existingText) {
    return existingText;
  }

  const sourcePath =
    normalizeText(raw.sourceLink)
    || normalizeText(raw.sourceStoragePath)
    || normalizeText(raw.filePath);
  const mimeType = normalizeText(raw.mimeType).toLowerCase();
  const fileName = normalizeText(raw.fileName).toLowerCase();
  if (!sourcePath || (!mimeType.includes("pdf") && !fileName.endsWith(".pdf"))) {
    return "";
  }

  if (!fs.existsSync(sourcePath)) {
    return "";
  }

  const result = spawnSync("pdftotext", ["-layout", sourcePath, "-"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 5,
  });
  if (result.status !== 0) {
    return "";
  }

  return normalizeText(result.stdout);
}

function inferCreditNoteKind(raw) {
  const haystack = keywordHaystack([
    raw.fileName,
    raw.caption,
    raw.textContent,
    raw.description,
    raw.counterparty,
  ]);

  const mentionsCreditNote =
    haystack.includes("gutschrift")
    || haystack.includes("credit note")
    || haystack.includes("credit memo");
  if (!mentionsCreditNote) {
    return null;
  }

  if (
    haystack.includes("gs-")
    || haystack.includes("kundennummer")
    || haystack.includes("debitor")
    || haystack.includes("bezugsrechnung")
    || haystack.includes("invoice re-")
  ) {
    return "revenue";
  }

  return null;
}

function inferDocumentType(raw) {
  if (DOCUMENT_TYPES.includes(raw.documentType)) {
    return raw.documentType;
  }

  if (inferCreditNoteKind(raw) === "revenue") {
    return "customer_invoice";
  }

  const haystack = keywordHaystack([
    raw.fileName,
    raw.caption,
    raw.textContent,
    raw.description,
  ]);

  if (
    haystack.includes("vertrag") ||
    haystack.includes("contract")
  ) {
    return "contract";
  }
  if (
    haystack.includes("quittung") ||
    haystack.includes("receipt") ||
    haystack.includes("kassenbon") ||
    haystack.includes("beleg")
  ) {
    return "receipt";
  }
  if (
    haystack.includes("ausgangsrechnung") ||
    haystack.includes("customer invoice") ||
    haystack.includes("invoice re-")
  ) {
    return "customer_invoice";
  }

  return "supplier_invoice";
}

function inferDirection(raw, documentType) {
  if (DIRECTION_VALUES.includes(raw.direction)) {
    return raw.direction;
  }
  if (documentType === "contract") {
    return "agreement";
  }
  if (documentType === "customer_invoice") {
    return "revenue";
  }

  if (documentType === "receipt") {
    const haystack = normalizedKeywordHaystack([
      raw.fileName,
      raw.caption,
      raw.textContent,
      raw.description,
      raw.counterparty,
    ]);
    const revenueReceiptSignals = [
      "kassenzugang",
      "bareinnahme",
      "dankend in bar erhalten",
      "debitor",
      "kunden nr",
      "kundennr",
      "datev konto",
      "zahlender",
      "soll 1000 kasse",
      "haben 8400 erlose",
    ];

    if (
      haystack.includes("kassenbeleg")
      && revenueReceiptSignals.some((signal) => haystack.includes(signal))
    ) {
      return "revenue";
    }
  }

  return "expense";
}

function findCounterpartyRule(raw) {
  const haystack = keywordHaystack([
    raw.fileName,
    raw.caption,
    raw.textContent,
    raw.description,
    raw.counterparty,
  ]);
  return (
    COUNTERPARTY_RULES.find((rule) =>
      rule.matchers.some((matcher) => haystack.includes(matcher)),
    ) || null
  );
}

function inferCounterparty(raw, rule) {
  return normalizeText(raw.counterparty) || rule?.counterparty || "Unspecified counterparty";
}

function deriveConfidence(raw, hasAmounts, rule) {
  if (STATUS_VALUES.includes(raw.status) && raw.status === "needs_review") {
    return "medium";
  }
  if (raw.confidence) {
    return normalizeText(raw.confidence);
  }
  if (rule && hasAmounts) {
    return "high";
  }
  if (hasAmounts) {
    return "medium";
  }
  return "low";
}

function deriveAmounts(raw) {
  const grossAmountEur = parseNumber(raw.grossAmountEur);
  const netAmountEur = parseNumber(raw.netAmountEur);
  const vatAmountEur = parseNumber(raw.vatAmountEur);
  const vatRate = parseNumber(raw.vatRate);

  if (grossAmountEur != null && netAmountEur != null && vatAmountEur != null) {
    return {
      grossAmountEur,
      netAmountEur,
      vatAmountEur,
      vatRate: vatRate != null ? vatRate : grossAmountEur === netAmountEur ? 0 : 19,
    };
  }

  if (grossAmountEur != null && vatRate != null) {
    const divisor = 1 + vatRate / 100;
    const netAmount = roundCurrency(grossAmountEur / divisor);
    return {
      grossAmountEur,
      netAmountEur: netAmount,
      vatAmountEur: roundCurrency(grossAmountEur - netAmount),
      vatRate,
    };
  }

  if (netAmountEur != null && vatRate != null) {
    const vatAmount = roundCurrency((netAmountEur * vatRate) / 100);
    return {
      grossAmountEur: roundCurrency(netAmountEur + vatAmount),
      netAmountEur,
      vatAmountEur: vatAmount,
      vatRate,
    };
  }

  return {
    grossAmountEur,
    netAmountEur,
    vatAmountEur,
    vatRate: vatRate != null ? vatRate : grossAmountEur != null ? 19 : 0,
  };
}

function inferPurposeKey(direction, rule) {
  if (!rule) {
    return direction === "revenue" ? "REVENUE_19" : "OFFICE_SUPPLIES";
  }
  return rule.purposeKey;
}

function buildDescription(raw, documentType, counterparty, creditNoteKind) {
  if (normalizeText(raw.description)) {
    return normalizeText(raw.description);
  }
  if (creditNoteKind === "revenue") {
    return `Customer credit note for ${counterparty}`;
  }
  const prefix = {
    supplier_invoice: "Supplier invoice",
    customer_invoice: "Customer invoice",
    receipt: "Receipt",
    contract: "Contract",
  }[documentType];
  return `${prefix} from ${counterparty}`;
}

function deriveStatus(raw, documentType, purposeKey) {
  if (STATUS_VALUES.includes(raw.status)) {
    return raw.status;
  }
  if (documentType === "contract") {
    return "reference_only";
  }
  if (purposeKey === "TEAM_EVENT_REVIEW") {
    return "needs_review";
  }
  return "ready";
}

function buildBookingProposal(document, mandantId) {
  if (document.documentType === "contract") {
    return null;
  }
  if (document.grossAmountEur == null || document.netAmountEur == null) {
    return null;
  }

  const common = {
    mandantId,
    postingDate: document.documentDate || new Date().toISOString().slice(0, 10),
    counterparty: document.counterparty,
    description: document.description,
    status: document.status === "reference_only" ? "needs_review" : document.status,
    grossAmountEur: document.grossAmountEur,
    netAmountEur: document.netAmountEur,
    vatAmountEur: document.vatAmountEur || 0,
    currency: document.currency,
    sourceType: "telegram_document",
    sourceReference:
      document.source.telegramFileId ||
      `telegram:${document.source.telegramChatId}:${document.source.telegramMessageId || document.id}`,
  };

  if (document.direction === "revenue") {
    if (document.documentType === "receipt") {
      return {
        ...common,
        lines: [
          {
            purposeKey: "CASH",
            entryDirection: "debit",
            amountEur: document.grossAmountEur,
            memo: "Cash received from Telegram revenue receipt",
          },
          {
            purposeKey: "REVENUE_19",
            entryDirection: "credit",
            amountEur: document.netAmountEur,
            taxRate: document.vatRate,
            memo: "Revenue at 19% VAT from Telegram cash receipt",
          },
          {
            purposeKey: "OUTPUT_VAT_19",
            entryDirection: "credit",
            amountEur: document.vatAmountEur || 0,
            taxRate: document.vatRate,
            memo: "Output VAT from Telegram cash receipt",
          },
        ],
      };
    }

    if (document.extractedFields?.creditNoteKind === "revenue") {
      return {
        ...common,
        lines: [
          {
            purposeKey: "REVENUE_19",
            entryDirection: "debit",
            amountEur: document.netAmountEur,
            taxRate: document.vatRate,
            memo: "Revenue reversal from Telegram customer credit note",
          },
          {
            purposeKey: "OUTPUT_VAT_19",
            entryDirection: "debit",
            amountEur: document.vatAmountEur || 0,
            taxRate: document.vatRate,
            memo: "Output VAT reversal from Telegram customer credit note",
          },
          {
            purposeKey: "TRADE_RECEIVABLES",
            entryDirection: "credit",
            amountEur: document.grossAmountEur,
            memo: "Receivable reduction from Telegram customer credit note",
          },
        ],
      };
    }

    return {
      ...common,
      lines: [
        {
          purposeKey: "TRADE_RECEIVABLES",
          entryDirection: "debit",
          amountEur: document.grossAmountEur,
          memo: "Open receivable from Telegram customer invoice",
        },
        {
          purposeKey: "REVENUE_19",
          entryDirection: "credit",
          amountEur: document.netAmountEur,
          taxRate: document.vatRate,
          memo: "Revenue at 19% VAT",
        },
        {
          purposeKey: "OUTPUT_VAT_19",
          entryDirection: "credit",
          amountEur: document.vatAmountEur || 0,
          taxRate: document.vatRate,
          memo: "Output VAT from Telegram intake",
        },
      ],
    };
  }

  const expenseLines = [
    {
      purposeKey: document.purposeKey,
      entryDirection: "debit",
      amountEur: document.netAmountEur,
      taxRate: document.vatRate,
      memo:
        document.status === "needs_review"
          ? "Expense captured from Telegram intake and held for review"
          : "Expense captured from Telegram intake",
    },
  ];

  if ((document.vatAmountEur || 0) > 0) {
    expenseLines.push({
      purposeKey: "INPUT_VAT_19",
      entryDirection: "debit",
      amountEur: document.vatAmountEur,
      taxRate: document.vatRate,
      memo: "Input VAT from Telegram intake",
    });
  }

  expenseLines.push({
    purposeKey: "TRADE_PAYABLES",
    entryDirection: "credit",
    amountEur: document.grossAmountEur,
    memo: "Open payable from Telegram supplier document",
  });

  return {
    ...common,
    lines: expenseLines,
  };
}

function normalizeDocument(raw, submission) {
  const sourceText = inferSourceText(raw);
  const enrichedRaw = sourceText
    ? {
        ...raw,
        textContent: normalizeText(raw.textContent) || sourceText,
      }
    : raw;
  const creditNoteKind = inferCreditNoteKind(enrichedRaw);
  const documentType = inferDocumentType(enrichedRaw);
  const direction = inferDirection(enrichedRaw, documentType);
  const counterpartyRule = findCounterpartyRule(enrichedRaw);
  const counterparty = inferCounterparty(enrichedRaw, counterpartyRule);
  const purposeKey =
    documentType === "contract" ? null : inferPurposeKey(direction, counterpartyRule);
  const amounts = deriveAmounts(enrichedRaw);
  const description = buildDescription(enrichedRaw, documentType, counterparty, creditNoteKind);
  const status = deriveStatus(enrichedRaw, documentType, purposeKey);
  const confidence = deriveConfidence(
    enrichedRaw,
    amounts.grossAmountEur != null || amounts.netAmountEur != null,
    counterpartyRule,
  );

  const normalized = {
    id: raw.id || randomUUID(),
    telegramMessageId:
      raw.telegramMessageId != null ? String(raw.telegramMessageId) : null,
    telegramFileId: normalizeText(raw.telegramFileId) || null,
    fileName: normalizeText(raw.fileName) || "telegram-document.bin",
    mimeType: normalizeText(raw.mimeType) || "application/octet-stream",
    documentType,
    direction,
    counterparty,
    documentDate: normalizeText(raw.documentDate) || null,
    servicePeriodStart: normalizeText(raw.servicePeriodStart) || null,
    servicePeriodEnd: normalizeText(raw.servicePeriodEnd) || null,
    description,
    status,
    confidence,
    currency: normalizeText(raw.currency) || "EUR",
    vatRate: amounts.vatRate || 0,
    grossAmountEur: amounts.grossAmountEur,
    netAmountEur: amounts.netAmountEur,
    vatAmountEur: amounts.vatAmountEur,
    purposeKey,
    sourceLink: normalizeText(enrichedRaw.sourceLink) || null,
    extractedFields: {
      caption: normalizeText(enrichedRaw.caption) || null,
      textContent: normalizeText(enrichedRaw.textContent) || null,
      invoiceNumber: normalizeText(enrichedRaw.invoiceNumber) || null,
      contractTitle: normalizeText(enrichedRaw.contractTitle) || null,
      creditNoteKind,
      keywords: Array.isArray(enrichedRaw.keywords)
        ? enrichedRaw.keywords.map((item) => normalizeText(item))
        : [],
    },
    rawPayload: enrichedRaw,
    source: {
      channel: "telegram",
      telegramChatId: String(submission.telegramChatId),
      telegramMessageId:
        enrichedRaw.telegramMessageId != null ? String(enrichedRaw.telegramMessageId) : null,
      telegramFileId: normalizeText(enrichedRaw.telegramFileId) || null,
      senderName: submission.senderName,
      submittedAt: submission.submittedAt,
    },
  };

  normalized.bookingProposal = buildBookingProposal(normalized, submission.mandantId);
  return normalized;
}

function applyDownloadedAttachments(documents, downloadedAttachments) {
  if (!downloadedAttachments || downloadedAttachments.size === 0) {
    return documents;
  }

  return documents.map((document) => {
    const downloadInfo = downloadedAttachments.get(document.telegramFileId);
    if (!downloadInfo?.filePath) {
      return document;
    }

    return {
      ...document,
      sourceLink: downloadInfo.filePath,
      rawPayload: {
        ...document.rawPayload,
        sourceLink: document.sourceLink || downloadInfo.filePath,
        sourceStoragePath: downloadInfo.filePath,
      },
    };
  });
}

function applyDownloadedAttachmentToRawDocument(rawDocument, downloadedAttachments) {
  if (!downloadedAttachments || downloadedAttachments.size === 0) {
    return rawDocument;
  }

  const downloadInfo = downloadedAttachments.get(rawDocument.telegramFileId);
  if (!downloadInfo?.filePath) {
    return rawDocument;
  }

  return {
    ...rawDocument,
    sourceLink: normalizeText(rawDocument.sourceLink) || downloadInfo.filePath,
    sourceStoragePath: normalizeText(rawDocument.sourceStoragePath) || downloadInfo.filePath,
    fileName: normalizeText(rawDocument.fileName) || downloadInfo.fileName || rawDocument.fileName,
    mimeType: normalizeText(rawDocument.mimeType) || downloadInfo.mimeType || rawDocument.mimeType,
  };
}

function normalizeCustomSubmission(payload, options = {}) {
  if (!payload.mandantId) {
    throw new Error("mandantId is required for Telegram intake submissions.");
  }
  if (!Array.isArray(payload.documents) || payload.documents.length === 0) {
    throw new Error("Telegram intake submissions require a non-empty documents array.");
  }

  const submission = {
    submissionId: payload.submissionId || randomUUID(),
    mandantId: payload.mandantId,
    telegramChatId:
      payload.telegramChatId != null ? String(payload.telegramChatId) : "unknown-chat",
    senderName: normalizeText(payload.senderName) || "Unknown sender",
    submittedAt: normalizeText(payload.submittedAt) || new Date().toISOString(),
    channel: "telegram",
    sourceLabel: normalizeText(payload.sourceLabel) || "Telegram document intake",
    documents: [],
  };

  submission.documents = payload.documents.map((document) =>
    normalizeDocument(
      applyDownloadedAttachmentToRawDocument(document, options.downloadedAttachments),
      submission,
    ),
  );

  submission.documents = applyDownloadedAttachments(
    submission.documents,
    options.downloadedAttachments,
  );
  return submission;
}

function normalizeWebhookSubmission(payload, options = {}) {
  const message = payload.message || payload.edited_message;
  const photo = Array.isArray(message?.photo) ? message.photo.at(-1) : null;
  if (!message?.document && !photo) {
    throw new Error("Telegram webhook payload must include message.document or message.photo.");
  }
  if (!payload.mandantId) {
    throw new Error("mandantId is required alongside Telegram webhook payloads.");
  }

  const fileLike = message.document || photo;
  const inferredFileName = message.document?.file_name
    || (photo ? `telegram-photo-${photo.file_id}.jpg` : "telegram-document.bin");
  const inferredMimeType = message.document?.mime_type
    || (photo ? "image/jpeg" : "application/octet-stream");

  return normalizeCustomSubmission({
    submissionId: payload.submissionId,
    mandantId: payload.mandantId,
    telegramChatId: message.chat?.id,
    senderName:
      message.from?.username ||
      [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") ||
      "Unknown sender",
    submittedAt:
      typeof message.date === "number"
        ? new Date(message.date * 1000).toISOString()
        : new Date().toISOString(),
    sourceLabel: "Telegram webhook intake",
    documents: [
      {
        telegramMessageId: message.message_id,
        telegramFileId: fileLike.file_id,
        fileName: inferredFileName,
        mimeType: inferredMimeType,
        caption: message.caption,
        textContent: message.caption || message.text,
      },
    ],
  }, options);
}

function normalizeTelegramSubmission(payload, options = {}) {
  if (Array.isArray(payload.documents)) {
    return normalizeCustomSubmission(payload, options);
  }
  if (payload.message?.document || payload.edited_message?.document) {
    return normalizeWebhookSubmission(payload, options);
  }
  throw new Error(
    "Unsupported Telegram intake payload. Send either { mandantId, documents[] } or a Telegram webhook payload with message.document.",
  );
}

module.exports = {
  DOCUMENT_TYPES,
  normalizeTelegramSubmission,
};
