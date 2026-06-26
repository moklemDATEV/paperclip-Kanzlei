#!/usr/bin/env node

const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { spawn } = require("node:child_process");
const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");

const PORT = 4192;
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

async function waitForServer(url, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for server to start.");
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "steuerberater-db-smoke-"));
  const dbPath = path.join(tempRoot, "smoke.sqlite");
  const serverPath = path.join(__dirname, "..", "steuerberater-db-server.js");

  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      STEUERBERATER_DB_HOST: HOST,
      STEUERBERATER_DB_PORT: String(PORT),
      STEUERBERATER_DB_FILE: dbPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  try {
    await waitForServer(`${BASE_URL}/api/steuerberater/health`);

    const initialHealth = await api("/api/steuerberater/health");
    if (!initialHealth.databasePath.endsWith("smoke.sqlite")) {
      throw new Error("Smoke server did not use the disposable database.");
    }

    await api("/api/steuerberater/mandanten", {
      method: "POST",
      body: JSON.stringify({
        id: "smoke-mandant",
        legalName: "Smoke Test GmbH",
        displayName: "Smoke Test",
        legalEntity: "GmbH",
        vatId: "DE000000001",
      }),
    });

    const createdAccount = await api("/api/steuerberater/account-catalog", {
      method: "POST",
      body: JSON.stringify({
        chartType: "SKR03",
        purposeKey: "SMOKE_EXPENSE",
        accountCode: "4999",
        accountName: "Smoke Expense",
        category: "expense",
        taxRate: 19,
        isActive: true,
      }),
    });

    const createdBooking = await api("/api/steuerberater/buchungen", {
      method: "POST",
      body: JSON.stringify({
        mandantId: "smoke-mandant",
        sourceType: "smoke",
        sourceReference: "smoke-001",
        postingDate: "2026-06-05",
        counterparty: "Smoke Supplier",
        description: "Smoke booking",
        status: "ready",
        grossAmountEur: 119,
        netAmountEur: 100,
        vatAmountEur: 19,
        currency: "EUR",
        annotation: "before update",
        lines: [
          { lineIndex: 1, purposeKey: "SMOKE_EXPENSE", entryDirection: "debit", amountEur: 100, taxRate: 19, memo: "Expense line" },
          { lineIndex: 2, purposeKey: "INPUT_VAT_19", entryDirection: "debit", amountEur: 19, taxRate: 19, memo: "VAT line" },
          { lineIndex: 3, purposeKey: "BANK", entryDirection: "credit", amountEur: 119, taxRate: 0, memo: "Bank line" },
        ],
      }),
    });

    await api(`/api/steuerberater/buchungen/${createdBooking.booking.id}?chartType=SKR03`, {
      method: "PUT",
      body: JSON.stringify({
        counterparty: "Smoke Supplier Updated",
        annotation: "after update",
        changedBy: "smoke-test",
        changeReason: "Verify changelog ordering",
      }),
    });

    const createdLine = await api("/api/steuerberater/buchung-lines", {
      method: "POST",
      body: JSON.stringify({
        buchungId: createdBooking.booking.id,
        lineIndex: 4,
        purposeKey: "BANK",
        entryDirection: "debit",
        amountEur: 1,
        taxRate: 0,
        memo: "Adjustment seed",
      }),
    });

    await api(`/api/steuerberater/buchung-lines/${createdLine.line.id}?chartType=SKR03`, {
      method: "PUT",
      body: JSON.stringify({
        amountEur: 2,
        annotation: "line note",
        changedBy: "smoke-test",
        changeReason: "Verify line changelog",
      }),
    });

    const changelog = await api("/api/steuerberater/changelog?limit=20");
    const bookingChange = changelog.entries.find(
      (entry) =>
        entry.buchungId === createdBooking.booking.id &&
        entry.fieldName === "annotation" &&
        entry.newValue === "after update",
    );
    const lineChange = changelog.entries.find(
      (entry) =>
        entry.buchungLineId === createdLine.line.id &&
        entry.fieldName === "annotation" &&
        entry.newValue === "line note",
    );

    if (!bookingChange || !lineChange) {
      throw new Error("Expected changelog entries were not recorded.");
    }

    const beforeExternalWrite = await api("/api/steuerberater/health");
    const externalStore = await createSharedBuchungsdatenStore({ filePath: dbPath });
    externalStore.ingestTelegramSubmission(
      {
        submissionId: "smoke-telegram-submission",
        mandantId: "smoke-mandant",
        telegramChatId: "smoke-chat",
        senderName: "Smoke Sender",
        documents: [
          {
            id: "smoke-telegram-document",
            telegramMessageId: "smoke-message-1",
            telegramFileId: "smoke-file-1",
            fileName: "smoke-telegram-invoice.pdf",
            mimeType: "application/pdf",
            documentType: "supplier_invoice",
            direction: "expense",
            counterparty: "Smoke Supplier External",
            documentDate: "2026-06-06",
            description: "Telegram smoke invoice",
            status: "ready",
            confidence: "high",
            currency: "EUR",
            vatRate: 19,
            grossAmountEur: 119,
            netAmountEur: 100,
            vatAmountEur: 19,
            purposeKey: "SMOKE_EXPENSE",
            extractedFields: { invoiceNumber: "SMOKE-TELEGRAM-1" },
            rawPayload: { source: "cross-process-smoke" },
            bookingProposal: {
              id: "smoke-telegram-booking",
              mandantId: "smoke-mandant",
              sourceType: "telegram_document",
              sourceReference: "telegram:smoke-file-1",
              postingDate: "2026-06-06",
              counterparty: "Smoke Supplier External",
              description: "Telegram smoke invoice booking",
              status: "ready",
              grossAmountEur: 119,
              netAmountEur: 100,
              vatAmountEur: 19,
              currency: "EUR",
              lines: [
                { lineIndex: 1, purposeKey: "SMOKE_EXPENSE", entryDirection: "debit", amountEur: 100, taxRate: 19, memo: "Expense line" },
                { lineIndex: 2, purposeKey: "INPUT_VAT_19", entryDirection: "debit", amountEur: 19, taxRate: 19, memo: "VAT line" },
                { lineIndex: 3, purposeKey: "TRADE_PAYABLES", entryDirection: "credit", amountEur: 119, taxRate: 0, memo: "Payable line" },
              ],
            },
          },
        ],
      },
      "SKR03",
    );
    await externalStore.save();

    const afterExternalWrite = await api("/api/steuerberater/health");
    if (afterExternalWrite.telegramDocuments !== beforeExternalWrite.telegramDocuments + 1) {
      throw new Error("Frontend server did not reload externally written Telegram documents.");
    }
    if (afterExternalWrite.buchungen !== beforeExternalWrite.buchungen + 1) {
      throw new Error("Frontend server did not reload externally written bookings.");
    }

    const documentsAfterExternalWrite = await api("/api/data/documents");
    if (!documentsAfterExternalWrite.documents.some((document) => document.id === "smoke-telegram-document")) {
      throw new Error("Frontend server did not expose the externally written document.");
    }

    const updatedDocument = await api("/api/data/documents/smoke-telegram-document", {
      method: "PUT",
      body: JSON.stringify({
        fileName: "smoke-telegram-invoice-updated.pdf",
        mimeType: "application/pdf",
        documentType: "supplier_invoice",
        direction: "expense",
        counterparty: "Smoke Supplier External Updated",
        documentDate: "2026-06-07",
        description: "Updated telegram smoke invoice",
        status: "needs_review",
        confidence: "medium",
        currency: "EUR",
        vatRate: 19,
        grossAmountEur: 119,
        netAmountEur: 100,
        vatAmountEur: 19,
        purposeKey: "SMOKE_EXPENSE",
        sourceLink: path.join(tempRoot, "smoke-telegram-invoice.pdf"),
        linkedBookingId: "smoke-telegram-booking",
      }),
    });
    if (updatedDocument.document.status !== "needs_review") {
      throw new Error("Document update did not persist.");
    }

    await fs.writeFile(path.join(tempRoot, "smoke-telegram-invoice.pdf"), "smoke file payload");
    const deletedDocument = await api("/api/data/documents/smoke-telegram-document?deleteStoredFile=true", {
      method: "DELETE",
    });
    if (!deletedDocument.deleted) {
      throw new Error("Document delete did not return success.");
    }
    try {
      await fs.stat(path.join(tempRoot, "smoke-telegram-invoice.pdf"));
      throw new Error("Document delete did not remove the stored file.");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const documentsAfterDelete = await api("/api/data/documents");
    if (documentsAfterDelete.documents.some((document) => document.id === "smoke-telegram-document")) {
      throw new Error("Deleted document is still exposed by the frontend server.");
    }

    await api(`/api/steuerberater/buchung-lines/${createdLine.line.id}`, { method: "DELETE" });
    await api(`/api/steuerberater/buchungen/${createdBooking.booking.id}`, { method: "DELETE" });
    await api("/api/steuerberater/buchungen/smoke-telegram-booking", { method: "DELETE" });
    await api(`/api/steuerberater/account-catalog/${createdAccount.account.id}`, { method: "DELETE" });
    await api("/api/steuerberater/mandanten/smoke-mandant", { method: "DELETE" });

    console.log("Steuerberater DB smoke passed.");
  } finally {
    child.kill("SIGTERM");
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
