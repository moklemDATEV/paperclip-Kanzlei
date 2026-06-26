#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");
const { normalizeTelegramSubmission } = require("../telegram-intake");

const ROOT_DIR = path.join(__dirname, "..");
const DEMO_PAYLOAD_PATH = path.join(ROOT_DIR, "data", "telegram-intake-demo.json");

async function main() {
  const payload = JSON.parse(await fs.readFile(DEMO_PAYLOAD_PATH, "utf8"));
  const store = await createSharedBuchungsdatenStore();
  const submission = normalizeTelegramSubmission(payload);
  const result = store.ingestTelegramSubmission(submission, "SKR04");
  await store.save();

  const bookingCount = result.documents.filter((document) => document.linkedBooking).length;
  console.log(
    JSON.stringify(
      {
        submission: result.submission,
        bookingCount,
        documentTypes: result.documents.map((document) => ({
          fileName: document.fileName,
          documentType: document.documentType,
          status: document.status,
          purposeKey: document.purposeKey,
          linkedBookingId: document.linkedBooking?.id || null,
          chartType: document.linkedBooking?.chartType || null,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
