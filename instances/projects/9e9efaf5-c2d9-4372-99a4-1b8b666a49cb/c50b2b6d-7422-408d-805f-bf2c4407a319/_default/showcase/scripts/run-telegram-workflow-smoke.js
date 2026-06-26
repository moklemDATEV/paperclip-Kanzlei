#!/usr/bin/env node

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CLIENT_CONTEXT, createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");
const { handleTelegramBotWebhook } = require("../telegram-bots");

const ROOT_DIR = path.join(__dirname, "..");
const FIXTURE_PATH = path.join(ROOT_DIR, "data", "telegram-mandant-webhook.json");

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "telegram-workflow-smoke-"));
  process.env.SHOWCASE_RUNTIME_DIR = tempDir;
  process.env.TELEGRAM_DISABLE_SEND = "1";
  process.env.SHOWCASE_PAPERCLIP_ACTIVATION_ENABLED = "0";
  process.env.TELEGRAM_DEFAULT_MANDANT_ID = CLIENT_CONTEXT.id;
  process.env.MANDANT_CHAT_ID = "8695197922";
  process.env.MANDANT_BOT_USERNAME = "Mandat_Paper_bot";

  const store = await createSharedBuchungsdatenStore({
    filePath: path.join(tempDir, "shared-buchungsdaten.sqlite"),
    reseed: true,
  });
  const update = JSON.parse(await fs.readFile(FIXTURE_PATH, "utf8"));
  const result = await handleTelegramBotWebhook({
    botKey: "mandant",
    update,
    store,
    chartType: "SKR03",
  });
  await store.save();

  if (!result.ticket) {
    throw new Error("Expected Mandant webhook handling to return a Telegram ticket.");
  }

  if (result.ticket.routeKey !== "internal_intake") {
    throw new Error(`Expected internal_intake route, received ${result.ticket.routeKey}.`);
  }

  if (!result.ticket.submissionId) {
    throw new Error("Expected Mandant webhook handling to persist a submission.");
  }

  const auditStages = result.auditEvents.map((event) => event.stage);
  if (!auditStages.includes("intake_persisted")) {
    throw new Error("Expected intake_persisted audit event for Mandant webhook.");
  }
  if (!auditStages.includes("workflow_handoff_prepared")) {
    throw new Error("Expected workflow_handoff_prepared audit event for Mandant webhook.");
  }
  if (!result.workflowRun) {
    throw new Error("Expected Mandant webhook handling to persist a workflow run.");
  }
  if (result.workflowRun.routes.length !== 1) {
    throw new Error(`Expected one workflow route, received ${result.workflowRun.routes.length}.`);
  }
  if (result.workflowRun.activations.length !== 0) {
    throw new Error("Expected no downstream workflow issues before explicit Mandant handoff.");
  }

  console.log(
    JSON.stringify(
      {
        routeKey: result.ticket.routeKey,
        assigneeAgentName: result.ticket.assigneeAgentName,
        submissionId: result.ticket.submissionId,
        issueIdentifier: result.ticket.paperclipIssueIdentifier,
        intakeDocumentCount: result.intake?.documents?.length || 0,
        workflowRoute: result.workflowRun.routes[0]?.downstreamPath || null,
        workflowActivations: result.workflowRun.activations.length,
        auditStages,
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
