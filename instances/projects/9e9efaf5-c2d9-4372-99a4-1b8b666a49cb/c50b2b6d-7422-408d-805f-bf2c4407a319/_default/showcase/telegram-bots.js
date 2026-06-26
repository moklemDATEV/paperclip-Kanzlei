const fs = require("node:fs/promises");
const path = require("node:path");
const { CLIENT_CONTEXT } = require("./db/shared-buchungsdaten");
const { processTelegramInboundMessage } = require("./telegram-ticketing");

const DEFAULT_SECRET_FILE = process.env.TELEGRAM_BOT_SECRETS_FILE
  || "/home/ubuntu/.paperclip-secrets/DAT-10-telegram.env";
const DEFAULT_WEBHOOK_CERTIFICATE_PATH = process.env.TELEGRAM_WEBHOOK_CERTIFICATE_PATH
  || "/etc/ssl/certs/paperclip.crt";

const BOT_KEYS = ["mandant", "kanzlei"];
const BOT_API_BASE = "https://api.telegram.org";
const DEFAULT_REVIEW_LIMIT = 5;

function parseEnvFile(contents) {
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
}

async function loadSecretEnv() {
  try {
    const contents = await fs.readFile(DEFAULT_SECRET_FILE, "utf8");
    return parseEnvFile(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function pickValue(source, key, fallback = null) {
  return source[key] != null && source[key] !== "" ? source[key] : fallback;
}

function getDefaultMandantId() {
  return process.env.TELEGRAM_DEFAULT_MANDANT_ID || CLIENT_CONTEXT.id;
}

async function getTelegramBotConfig() {
  const fileEnv = await loadSecretEnv();
  const merged = { ...fileEnv, ...process.env };
  return {
    secretFilePath: DEFAULT_SECRET_FILE,
    defaultMandantId: getDefaultMandantId(),
    disableSend:
      merged.TELEGRAM_DISABLE_SEND === "1"
      || merged.TELEGRAM_DISABLE_SEND === "true",
    publicBaseUrl: pickValue(merged, "SHOWCASE_PUBLIC_URL"),
    paperclipActivation: {
      enabled: pickValue(merged, "SHOWCASE_PAPERCLIP_ACTIVATION_ENABLED"),
      allowHeartbeatContext: pickValue(merged, "SHOWCASE_PAPERCLIP_ALLOW_HEARTBEAT_CONTEXT"),
      apiUrl: pickValue(merged, "SHOWCASE_PAPERCLIP_API_URL"),
      apiKey: pickValue(merged, "SHOWCASE_PAPERCLIP_API_KEY"),
      companyId: pickValue(merged, "SHOWCASE_PAPERCLIP_COMPANY_ID"),
      runId: pickValue(merged, "SHOWCASE_PAPERCLIP_RUN_ID"),
      projectId: pickValue(merged, "SHOWCASE_PAPERCLIP_PROJECT_ID"),
      goalId: pickValue(merged, "SHOWCASE_PAPERCLIP_GOAL_ID"),
      parentId: pickValue(merged, "SHOWCASE_PAPERCLIP_PARENT_ISSUE_ID"),
      documentIngestionAgentId: pickValue(
        merged,
        "SHOWCASE_PAPERCLIP_DOCUMENT_INGESTION_AGENT_ID",
      ),
      bookkeepingReconciliationAgentId: pickValue(
        merged,
        "SHOWCASE_PAPERCLIP_BOOKKEEPING_AGENT_ID",
      ),
      reviewCopilotAgentId: pickValue(
        merged,
        "SHOWCASE_PAPERCLIP_REVIEW_AGENT_ID",
      ),
    },
    bots: {
      mandant: {
        key: "mandant",
        username: pickValue(merged, "MANDANT_BOT_USERNAME"),
        token: pickValue(merged, "MANDANT_BOT_TOKEN"),
        chatId: pickValue(merged, "MANDANT_CHAT_ID"),
        mode: pickValue(merged, "MANDANT_MODE", "one_to_one"),
        pipeline: "intake",
      },
      kanzlei: {
        key: "kanzlei",
        username: pickValue(merged, "KANZLEI_BOT_USERNAME"),
        token: pickValue(merged, "KANZLEI_BOT_TOKEN"),
        chatId: pickValue(merged, "KANZLEI_CHAT_ID"),
        mode: pickValue(merged, "KANZLEI_MODE", "group_enabled"),
        pipeline: "review",
      },
    },
  };
}

function getWebhookPath(botKey) {
  return `/api/telegram/bots/${botKey}/webhook`;
}

function toPublicBotDescriptor(config, bot) {
  return {
    key: bot.key,
    username: bot.username || null,
    chatId: bot.chatId || null,
    mode: bot.mode,
    pipeline: bot.pipeline,
    webhookPath: getWebhookPath(bot.key),
    webhookUrl: config.publicBaseUrl
      ? `${config.publicBaseUrl}${getWebhookPath(bot.key)}`
      : null,
    hasToken: Boolean(bot.token),
  };
}

function describeBotConfig(config) {
  return {
    defaultMandantId: config.defaultMandantId,
    disableSend: config.disableSend,
    publicBaseUrl: config.publicBaseUrl || null,
    secretFilePath: config.secretFilePath,
    bots: BOT_KEYS.map((key) => toPublicBotDescriptor(config, config.bots[key])),
  };
}

async function callTelegram(botToken, method, payload) {
  const response = await fetch(`${BOT_API_BASE}/bot${botToken}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`Telegram API ${method} failed: ${body.description || response.statusText}`);
  }
  return body.result;
}


async function callTelegramMultipart(botToken, method, formData) {
  const response = await fetch(`${BOT_API_BASE}/bot${botToken}/${method}`, {
    method: "POST",
    body: formData,
  });

  const body = await response.json();
  if (!response.ok || body.ok === false) {
    throw new Error(`Telegram API ${method} failed: ${body.description || response.statusText}`);
  }
  return body.result;
}

async function sendTelegramMessage(config, bot, chatId, text) {
  if (config.disableSend) {
    return {
      ok: true,
      dryRun: true,
      bot: bot.key,
      chatId: String(chatId),
      text,
    };
  }

  if (!bot.token) {
    throw new Error(`Missing token for Telegram bot ${bot.key}.`);
  }

  return callTelegram(bot.token, "sendMessage", {
    chat_id: chatId,
    text,
  });
}

function getMessage(update) {
  return update.message || update.edited_message || null;
}

function getChatId(update) {
  const message = getMessage(update);
  return message?.chat?.id != null ? String(message.chat.id) : null;
}

function getCommandText(update) {
  const text = getMessage(update)?.text;
  return typeof text === "string" ? text.trim() : "";
}

function buildMandantHelp(bot) {
  return [
    `${bot.username || "Mandant bot"} is connected to the intake pipeline.`,
    "Send invoices, receipts, or contracts as a PDF/image/document here.",
    "Each upload will be classified and written into the accounting database with source linkage.",
  ].join("\n");
}

function buildMandantIntakeAcknowledgement(routing) {
  const documents = routing.intake?.documents || [];
  const lines = [
    "Danke, wir haben Ihre Unterlagen erhalten.",
  ];

  if (documents.length > 0) {
    lines.push(`Erfasst: ${documents.length} Dokument(e).`);
    for (const document of documents) {
      lines.push(`- ${document.fileName}: ${document.documentType}, ${document.status}`);
    }
  } else if (routing.ticket?.attachments?.length > 0) {
    lines.push(`Erfasst: ${routing.ticket.attachments.length} Anhang/Anhaenge.`);
  } else {
    lines.push("Ihre Nachricht wurde an die Kanzlei weitergeleitet.");
  }

  if (routing.workflowRun?.activations?.length) {
    lines.push("Die Verarbeitung ist gestartet.");
  } else if (routing.workflowRun?.routes?.length) {
    lines.push("Der Eingang wurde erfasst und wird nun intern uebergeben.");
  }

  const bookingConfirmation = buildMandantBookingConfirmation(routing);
  if (bookingConfirmation) {
    lines.push(bookingConfirmation);
  }

  lines.push("Wir melden uns, falls Rueckfragen offen sind.");
  return lines.join("\n");
}

function buildMandantDuplicateAcknowledgement(ticket) {
  const lines = [
    "Diese Nachricht liegt uns bereits vor.",
  ];

  if (ticket?.paperclipIssueIdentifier) {
    lines.push(`Vorgang: ${ticket.paperclipIssueIdentifier}`);
  }

  lines.push("Wir melden uns, falls Rueckfragen offen sind.");
  return lines.join("\n");
}

function buildIntakeSummary(result, workflowRun) {
  const lines = [
    `Intake recorded ${result.documents.length} document(s).`,
  ];

  for (const document of result.documents) {
    const bookingInfo = document.linkedBooking
      ? `booking ${document.linkedBooking.chartType} ${document.linkedBooking.id}`
      : "no booking";
    lines.push(
      `- ${document.fileName}: ${document.documentType}, ${document.status}, ${bookingInfo}`,
    );
  }

  if (workflowRun?.routes?.length) {
    lines.push("Workflow routing:");
    for (const route of workflowRun.routes) {
      lines.push(
        `- ${route.fileName}: ${route.downstreamPath} via ${route.routedToAgent}`,
      );
    }
  }

  if (workflowRun?.activations?.length) {
    lines.push("Company agents activated:");
    for (const activation of workflowRun.activations) {
      const issueLabel = activation.issueIdentifier || activation.issueId;
      lines.push(`- ${issueLabel}: ${activation.assigneeAgentName}`);
    }
  }

  return lines.join("\n");
}

function summarizeReviewQueue(documents) {
  if (documents.length === 0) {
    return "Review queue is empty. No Telegram documents are currently marked needs_review.";
  }

  const lines = ["Current Telegram review queue:"];
  for (const document of documents.slice(0, DEFAULT_REVIEW_LIMIT)) {
    lines.push(
      `- ${document.fileName}: ${document.counterparty}, ${document.status}, ${document.grossAmountEur ?? "n/a"} EUR, ${document.purposeKey || "no-purpose-key"}`,
    );
  }
  if (documents.length > DEFAULT_REVIEW_LIMIT) {
    lines.push(`- ...and ${documents.length - DEFAULT_REVIEW_LIMIT} more`);
  }
  return lines.join("\n");
}

function summarizeLatestSubmission(submissions) {
  if (submissions.length === 0) {
    return "No Telegram submissions have been recorded yet.";
  }

  const [latest] = submissions;
  return [
    "Latest Telegram submission:",
    `- submission ${latest.id}`,
    `- sender ${latest.senderName}`,
    `- submitted ${latest.submittedAt}`,
    `- documents ${latest.documentCount}`,
  ].join("\n");
}

function countBookedDocuments(routing) {
  const documents = routing?.intake?.documents || [];
  return documents.filter((document) => document.linkedBooking && document.linkedBooking.id).length;
}

function buildMandantBookingConfirmation(routing) {
  const bookedCount = countBookedDocuments(routing);
  if (bookedCount === 0) {
    return null;
  }
  return bookedCount === 1
    ? "Ein Beleg wurde erfolgreich in die Buchhaltung übernommen."
    : `Es wurden ${bookedCount} Belege erfolgreich in die Buchhaltung übernommen.`;
}

async function handleMandantUpdate(config, bot, update, store, chartType) {
  const message = getMessage(update);
  const chatId = getChatId(update);
  if (!message || !chatId) {
    return processTelegramInboundMessage({
      botKey: bot.key,
      update,
      store,
      chartType,
      config,
      bot,
    });
  }

  const routing = await processTelegramInboundMessage({
    botKey: bot.key,
    update,
    store,
    chartType,
    config,
    bot,
  });

  const commandText = getCommandText(update);
  if (commandText === "/start" || commandText === "/help") {
    return {
      ...routing,
      action: "help",
      response: await sendTelegramMessage(config, bot, chatId, buildMandantHelp(bot)),
    };
  }

  if (routing.duplicate) {
    return {
      ...routing,
      action: "duplicate_acknowledgement",
      response: await sendTelegramMessage(
        config,
        bot,
        chatId,
        buildMandantDuplicateAcknowledgement(routing.ticket),
      ),
    };
  }

  const intakeAcknowledgement = buildMandantIntakeAcknowledgement(routing);
  const response = await sendTelegramMessage(config, bot, chatId, intakeAcknowledgement);
  const bookingCount = countBookedDocuments(routing);
  if (bookingCount > 0) {
    store.addTelegramTicketAuditEvent(ticket.id, "mandant_confirmation_sent", {
      bookingCount,
    });
    await store.save();
  }

  return {
    ...routing,
    action: "intake_acknowledgement",
    response,
  };
}

async function handleKanzleiUpdate(config, bot, update, store, chartType) {
  const message = getMessage(update);
  const chatId = getChatId(update);
  if (!message || !chatId) {
    return processTelegramInboundMessage({
      botKey: bot.key,
      update,
      store,
      chartType,
      config,
      bot,
    });
  }

  const routing = await processTelegramInboundMessage({
    botKey: bot.key,
    update,
    store,
    chartType,
    config,
    bot,
  });

  const commandText = getCommandText(update);
  if (commandText === "/start" || commandText === "/help") {
    return {
      ...routing,
      action: "help",
      response: await sendTelegramMessage(
        config,
        bot,
        chatId,
        [
          `${bot.username || "Kanzlei bot"} is connected to the review pipeline.`,
          "Commands:",
          "/review_queue - list Telegram documents that still need review",
          "/latest_submission - show the latest Telegram submission summary",
        ].join("\n"),
      ),
    };
  }

  if (commandText === "/review_queue") {
    const documents = store
      .listTelegramDocuments(config.defaultMandantId, chartType)
      .filter((document) => document.status === "needs_review");
    return {
      ...routing,
      action: "review_queue",
      reviewQueueSize: documents.length,
      response: await sendTelegramMessage(
        config,
        bot,
        chatId,
        summarizeReviewQueue(documents),
      ),
    };
  }

  if (commandText === "/latest_submission") {
    const submissions = store.listTelegramSubmissions(config.defaultMandantId);
    return {
      ...routing,
      action: "latest_submission",
      response: await sendTelegramMessage(
        config,
        bot,
        chatId,
        summarizeLatestSubmission(submissions),
      ),
    };
  }

  return {
    ...routing,
    action: "routed_message",
  };
}

async function sendApprovedClientReply({ store, config, ticketId, text, chatId = null }) {
  const ticket = store.getTelegramMessageTicketById(ticketId);
  if (!ticket) {
    throw new Error(`Telegram message ticket not found: ${ticketId}`);
  }
  if (ticket.routeKey !== "outbound_request") {
    throw new Error("Only Client Communication tickets may write back to the client bot.");
  }

  const targetChatId = chatId || ticket.telegramChatId;
  const approval = store.releaseTelegramOutbound(ticketId, {
    botKey: "mandant",
    chatId: targetChatId,
    text,
  });
  store.addTelegramTicketAuditEvent(ticketId, "client_reply_released", {
    chatId: targetChatId,
    text,
  });
  const response = await sendTelegramMessage(config, config.bots.mandant, targetChatId, text);
  await store.save();

  return {
    approval,
    response,
  };
}

async function handleTelegramBotWebhook({ botKey, update, store, chartType = "SKR03" }) {
  const config = await getTelegramBotConfig();
  const bot = config.bots[botKey];

  if (!bot) {
    throw new Error(`Unknown Telegram bot key: ${botKey}`);
  }

  if (botKey === "mandant") {
    return handleMandantUpdate(config, bot, update, store, chartType);
  }
  if (botKey === "kanzlei") {
    return handleKanzleiUpdate(config, bot, update, store, chartType);
  }

  throw new Error(`Unsupported Telegram bot pipeline: ${botKey}`);
}

async function verifyTelegramBots() {
  const config = await getTelegramBotConfig();
  const results = [];

  for (const botKey of BOT_KEYS) {
    const bot = config.bots[botKey];
    if (!bot.token) {
      results.push({
        key: bot.key,
        username: bot.username || null,
        configured: false,
        error: "Missing token",
      });
      continue;
    }

    const me = await callTelegram(bot.token, "getMe", {});
    const webhookInfo = await callTelegram(bot.token, "getWebhookInfo", {});
    results.push({
      key: bot.key,
      username: bot.username || null,
      configured: true,
      telegramUsername: me.username ? `@${me.username}` : null,
      webhookUrl: webhookInfo.url || null,
      hasCustomCertificate: Boolean(webhookInfo.has_custom_certificate),
      pendingUpdateCount: webhookInfo.pending_update_count,
    });
  }

  return {
    defaultMandantId: config.defaultMandantId,
    bots: results,
  };
}

async function registerTelegramWebhooks() {
  const config = await getTelegramBotConfig();
  if (!config.publicBaseUrl) {
    throw new Error("SHOWCASE_PUBLIC_URL is required to register Telegram webhooks.");
  }

  let certificateBuffer = null;
  try {
    certificateBuffer = await fs.readFile(DEFAULT_WEBHOOK_CERTIFICATE_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const results = [];
  for (const botKey of BOT_KEYS) {
    const bot = config.bots[botKey];
    if (!bot.token) {
      throw new Error(`Missing token for Telegram bot ${bot.key}.`);
    }

    const webhookUrl = `${config.publicBaseUrl}${getWebhookPath(botKey)}`;
    let result;
    if (certificateBuffer) {
      const formData = new FormData();
      formData.set("url", webhookUrl);
      formData.set(
        "certificate",
        new Blob([certificateBuffer], { type: "application/x-pem-file" }),
        path.basename(DEFAULT_WEBHOOK_CERTIFICATE_PATH),
      );
      result = await callTelegramMultipart(bot.token, "setWebhook", formData);
    } else {
      result = await callTelegram(bot.token, "setWebhook", { url: webhookUrl });
    }
    results.push({
      key: bot.key,
      username: bot.username || null,
      webhookUrl,
      certificatePath: certificateBuffer ? DEFAULT_WEBHOOK_CERTIFICATE_PATH : null,
      result,
    });
  }

  return { publicBaseUrl: config.publicBaseUrl, results };
}

module.exports = {
  BOT_KEYS,
  describeBotConfig,
  getTelegramBotConfig,
  getWebhookPath,
  handleTelegramBotWebhook,
  registerTelegramWebhooks,
  sendApprovedClientReply,
  verifyTelegramBots,
};
