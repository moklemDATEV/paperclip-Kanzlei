const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const ROOT_DIR = __dirname;
const ROUTING_RULE_VERSION = "dat-22-v1";

function getRuntimeDir() {
  return process.env.SHOWCASE_RUNTIME_DIR || path.join(ROOT_DIR, "runtime");
}

function getWorkflowDir() {
  return path.join(getRuntimeDir(), "telegram-workflow");
}

function buildRoute(document) {
  if (document.documentType === "contract") {
    return {
      routedToAgent: "kanzlei_review_agent",
      downstreamPath: "reference:contract_review",
      queue: "reference_review",
      reason: "Contracts are stored as reference documents and require Kanzlei follow-up.",
    };
  }

  if (document.direction === "revenue") {
    if (!document.linkedBooking?.id) {
      return {
        routedToAgent: "receivables_agent",
        downstreamPath: "receivables:extract_fields",
        queue: "receivables_extraction",
        reason: "Revenue-side Telegram documents without a linked booking first need receivables extraction.",
      };
    }

    return {
      routedToAgent: "receivables_agent",
      downstreamPath: "receivables:invoice_match",
      queue: "receivables",
      reason: "Revenue-side Telegram documents belong in the receivables matching flow.",
    };
  }

  if (document.status === "needs_review") {
    return {
      routedToAgent: "bookkeeping_agent",
      downstreamPath: "bookkeeping:needs_review",
      queue: "review_queue",
      reason: "Expense documents flagged needs_review stay in the bookkeeping review queue.",
    };
  }

  if (!document.linkedBooking?.id) {
    return {
      routedToAgent: "bookkeeping_agent",
      downstreamPath: "bookkeeping:extract_fields",
      queue: "extraction_queue",
      reason: "Telegram expense documents without a linked booking need bookkeeping extraction before posting.",
    };
  }

  return {
    routedToAgent: "bookkeeping_agent",
    downstreamPath: "bookkeeping:auto_post",
    queue: "accounts_payable",
    reason: "Supplier-side expense documents with linked bookings can move into bookkeeping directly.",
  };
}

function summarizeRoutes(routes) {
  return routes.reduce((summary, route) => {
    summary[route.queue] = (summary[route.queue] || 0) + 1;
    return summary;
  }, {});
}

function getFileName(run) {
  const stamp = run.createdAt.replace(/[:.]/g, "-");
  return `${stamp}-${run.submission.id}.json`;
}

function createTelegramWorkflowRun(result, options = {}) {
  const createdAt = new Date().toISOString();
  const routes = result.documents.map((document) => {
    const route = buildRoute(document);
    return {
      documentId: document.id,
      fileName: document.fileName,
      sourceLink: document.sourceLink || null,
      documentType: document.documentType,
      direction: document.direction,
      status: document.status,
      counterparty: document.counterparty,
      linkedBookingId: document.linkedBooking?.id || null,
      ...route,
    };
  });

  return {
    id: randomUUID(),
    workflow: "telegram_invoice_intake",
    routingRuleVersion: ROUTING_RULE_VERSION,
    createdAt,
    chartType: options.chartType || "SKR03",
    trigger: options.trigger || "api",
    source: {
      channel: result.submission.channel,
      sourceLabel: result.submission.sourceLabel,
      botKey: options.botKey || null,
    },
    submission: result.submission,
    routes,
    summary: {
      documentCount: result.documents.length,
      queueCounts: summarizeRoutes(routes),
    },
    activations: [],
  };
}

async function writeTelegramWorkflowRun(run) {
  const workflowDir = getWorkflowDir();
  const fileName = getFileName(run);
  const relativePath = `./runtime/telegram-workflow/${fileName}`;
  const latestRelativePath = "./runtime/telegram-workflow/latest.json";
  const payload = JSON.stringify(run, null, 2);

  await fs.mkdir(workflowDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(workflowDir, fileName), payload),
    fs.writeFile(path.join(workflowDir, "latest.json"), payload),
  ]);

  return {
    ...run,
    artifacts: {
      relativePath,
      latestRelativePath,
    },
  };
}

async function persistTelegramWorkflowRun(result, options = {}) {
  const run = createTelegramWorkflowRun(result, options);
  return writeTelegramWorkflowRun(run);
}

async function listTelegramWorkflowRuns(mandantId) {
  const workflowDir = getWorkflowDir();
  let fileNames;

  try {
    fileNames = await fs.readdir(workflowDir);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const runs = await Promise.all(
    fileNames
      .filter((fileName) => fileName.endsWith(".json") && fileName !== "latest.json")
      .map(async (fileName) => {
        const raw = await fs.readFile(path.join(workflowDir, fileName), "utf8");
        return JSON.parse(raw);
      }),
  );

  return runs
    .filter((run) => run.submission?.mandantId === mandantId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

module.exports = {
  ROUTING_RULE_VERSION,
  createTelegramWorkflowRun,
  listTelegramWorkflowRuns,
  persistTelegramWorkflowRun,
  writeTelegramWorkflowRun,
};
