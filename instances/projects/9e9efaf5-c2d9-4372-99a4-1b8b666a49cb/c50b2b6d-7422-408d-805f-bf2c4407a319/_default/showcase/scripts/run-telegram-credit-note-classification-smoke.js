#!/usr/bin/env node

const path = require("node:path");
const { CLIENT_CONTEXT } = require("../db/shared-buchungsdaten");
const { normalizeTelegramSubmission } = require("../telegram-intake");
const { createTelegramWorkflowRun } = require("../telegram-workflow");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function findLine(lines, purposeKey, entryDirection) {
  return lines.find((line) => line.purposeKey === purposeKey && line.entryDirection === entryDirection);
}

function main() {
  const webhookSubmission = normalizeTelegramSubmission({
    mandantId: CLIENT_CONTEXT.id,
    message: {
      message_id: 501,
      date: Date.parse("2026-06-19T08:58:42Z") / 1000,
      chat: { id: 8695197922 },
      from: { username: "mandant" },
      document: {
        file_id: "telegram-gs-credit-note",
        file_name: "GS-2026-0005_Gutschrift.pdf",
        mime_type: "application/pdf",
      },
      caption: "Gutschrift GS-2026-0005 zu Bezugsrechnung RE-2026-0023",
    },
  });

  const webhookDocument = webhookSubmission.documents[0];
  assert(webhookDocument.documentType === "customer_invoice", "Expected webhook credit note to classify as customer_invoice.");
  assert(webhookDocument.direction === "revenue", "Expected webhook credit note to classify as revenue.");
  assert(webhookDocument.extractedFields.creditNoteKind === "revenue", "Expected webhook credit note marker.");
  assert(webhookDocument.bookingProposal === null, "Webhook intake without parsed amounts should not auto-book.");

  const extractedSubmission = normalizeTelegramSubmission({
    mandantId: CLIENT_CONTEXT.id,
    telegramChatId: "8695197922",
    senderName: "Smoke Test",
    submittedAt: "2026-06-19T08:58:42.000Z",
    documents: [
      {
        fileName: "GS-2026-0005_Gutschrift.pdf",
        mimeType: "application/pdf",
        caption: "Gutschrift GS-2026-0005",
        textContent: "Gutschrift GS-2026-0005 Kundennummer KD-00182 Debitor 10182 Bezugsrechnung RE-2026-0023",
        counterparty: "Hotel Alpenpanorama GmbH & Co. KG",
        documentDate: "2026-05-19",
        grossAmountEur: 654.5,
        netAmountEur: 550,
        vatAmountEur: 104.5,
        vatRate: 19,
      },
    ],
  });

  const extractedDocument = extractedSubmission.documents[0];
  const booking = extractedDocument.bookingProposal;
  assert(booking, "Expected extracted credit note to build a booking proposal.");

  const revenueReversal = findLine(booking.lines, "REVENUE_19", "debit");
  const outputVatReversal = findLine(booking.lines, "OUTPUT_VAT_19", "debit");
  const receivableReduction = findLine(booking.lines, "TRADE_RECEIVABLES", "credit");

  assert(revenueReversal?.amountEur === 550, "Expected 550 EUR revenue reversal debit.");
  assert(outputVatReversal?.amountEur === 104.5, "Expected 104.5 EUR output VAT reversal debit.");
  assert(receivableReduction?.amountEur === 654.5, "Expected 654.5 EUR receivable reduction credit.");

  const cashReceiptPdfPath = path.join(
    __dirname,
    "..",
    "runtime",
    "telegram-files",
    "BQACAgIAAxkBAANTajULs2ZAIS1werybrxaxSrBvP2UAAjWfAALZ7ahJQiiQPuSv6zg8BA",
    "Kassenbeleg_20260619.pdf",
  );
  const cashReceiptSubmission = normalizeTelegramSubmission({
    mandantId: CLIENT_CONTEXT.id,
    message: {
      message_id: 601,
      date: Date.parse("2026-06-19T09:28:19Z") / 1000,
      chat: { id: 8695197922 },
      from: { username: "mandant" },
      document: {
        file_id: "telegram-cash-receipt",
        file_name: "Kassenbeleg_20260619.pdf",
        mime_type: "application/pdf",
      },
    },
  }, {
    downloadedAttachments: new Map([
      [
        "telegram-cash-receipt",
        {
          filePath: cashReceiptPdfPath,
          fileName: "Kassenbeleg_20260619.pdf",
          mimeType: "application/pdf",
        },
      ],
    ]),
  });

  const cashReceiptDocument = cashReceiptSubmission.documents[0];
  assert(cashReceiptDocument.documentType === "receipt", "Expected cash receipt PDF to stay typed as receipt.");
  assert(cashReceiptDocument.direction === "revenue", "Expected cash receipt PDF to classify as revenue.");
  assert(
    cashReceiptDocument.extractedFields.textContent.includes("Kassenzugang (Bareinnahme)"),
    "Expected source PDF text extraction to hydrate textContent for routing signals.",
  );

  const enrichedCashReceiptSubmission = normalizeTelegramSubmission({
    mandantId: CLIENT_CONTEXT.id,
    telegramChatId: "8695197922",
    senderName: "Smoke Test",
    submittedAt: "2026-06-19T09:28:19.000Z",
    documents: [
      {
        fileName: "Kassenbeleg_20260619.pdf",
        mimeType: "application/pdf",
        sourceLink: cashReceiptPdfPath,
        grossAmountEur: 249.9,
        netAmountEur: 210,
        vatAmountEur: 39.9,
        vatRate: 19,
      },
    ],
  });
  const cashReceiptBooking = enrichedCashReceiptSubmission.documents[0].bookingProposal;
  assert(cashReceiptBooking, "Expected enriched cash receipt to build a booking proposal.");
  assert(
    findLine(cashReceiptBooking.lines, "CASH", "debit")?.amountEur === 249.9,
    "Expected cash receipt booking to debit CASH for the gross amount.",
  );
  assert(
    findLine(cashReceiptBooking.lines, "REVENUE_19", "credit")?.amountEur === 210,
    "Expected cash receipt booking to credit revenue for the net amount.",
  );
  assert(
    findLine(cashReceiptBooking.lines, "OUTPUT_VAT_19", "credit")?.amountEur === 39.9,
    "Expected cash receipt booking to credit output VAT for the VAT amount.",
  );

  const workflowRun = createTelegramWorkflowRun({
    submission: { channel: "telegram", sourceLabel: "Telegram webhook intake" },
    documents: cashReceiptSubmission.documents,
  });
  const cashReceiptRoute = workflowRun.routes[0];
  assert(cashReceiptRoute.routedToAgent === "receivables_agent", "Expected cash receipt to route into the receivables flow.");
  assert(
    cashReceiptRoute.downstreamPath === "receivables:extract_fields",
    "Expected cash receipt without linked booking to route to receivables extraction.",
  );

  console.log(JSON.stringify({
    webhookClassification: {
      documentType: webhookDocument.documentType,
      direction: webhookDocument.direction,
      creditNoteKind: webhookDocument.extractedFields.creditNoteKind,
    },
    cashReceiptClassification: {
      documentType: cashReceiptDocument.documentType,
      direction: cashReceiptDocument.direction,
      route: cashReceiptRoute.downstreamPath,
    },
    extractedBookingLines: booking.lines.map((line) => ({
      purposeKey: line.purposeKey,
      entryDirection: line.entryDirection,
      amountEur: line.amountEur,
    })),
  }, null, 2));
}

main();
