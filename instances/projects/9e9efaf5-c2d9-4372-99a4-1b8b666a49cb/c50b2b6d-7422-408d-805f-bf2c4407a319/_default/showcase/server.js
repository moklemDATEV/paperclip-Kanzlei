#!/usr/bin/env node

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const { randomUUID } = require("node:crypto");
const {
  SUPPORTED_CHART_TYPES,
  createSharedBuchungsdatenStore,
} = require("./db/shared-buchungsdaten");
const { normalizeTelegramSubmission } = require("./telegram-intake");
const {
  describeBotConfig,
  getTelegramBotConfig,
  handleTelegramBotWebhook,
} = require("./telegram-bots");
const {
  createTelegramWorkflowRun,
  listTelegramWorkflowRuns,
  writeTelegramWorkflowRun,
} = require("./telegram-workflow");

const HOST = process.env.SHOWCASE_HOST || "127.0.0.1";
const PORT = Number(process.env.SHOWCASE_PORT || "4173");
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.SHOWCASE_MODEL || "gpt-4.1-mini";

const CLIENT_CONTEXT = {
  name: "Berg & Tal Eventtechnik GmbH",
  period: "April 2026",
  kanzleiContact: "Maria Schneider, Steuerfachangestellte",
  legalEntity: "GmbH",
  industry: "Event equipment rental",
  vatId: "DE342198765",
  accountingBasis: "Standard monthly bookkeeping with DATEV export",
  bank: "Sparkasse KoelnBonn business account",
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

let activeRun = null;
const sharedBuchungsdatenStorePromise = createSharedBuchungsdatenStore();

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function parseJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new Error("Request body must be valid JSON.");
  }
}

function parseCsv(text) {
  const [headerLine, ...rows] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return headers.reduce((record, header, index) => {
      const rawValue = values[index] || "";
      if (header === "gross_eur") {
        record.grossEur = Number(rawValue);
      } else if (header === "date" || header === "counterparty") {
        record[header] = rawValue;
      } else {
        record[header] = rawValue;
      }
      return record;
    }, {});
  });
}

async function readJson(fileName) {
  const contents = await fs.readFile(path.join(DATA_DIR, fileName), "utf8");
  return JSON.parse(contents);
}

async function loadSourceBundle() {
  const [bankCsv, supplierInvoices, customerInvoices, salesSummary] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, "2026-04-bank.csv"), "utf8"),
    readJson("supplier-invoices.json"),
    readJson("customer-invoices.json"),
    readJson("sales-summary-april.json"),
  ]);

  const bankTransactions = parseCsv(bankCsv);
  const rawInputs = [
    {
      fileName: "2026-04-bank.csv",
      type: "Bank export",
      countLabel: `${bankTransactions.length} posted lines`,
      notes: "Primary reconciliation source for the month.",
    },
    {
      fileName: "supplier-invoices.json",
      type: "Supplier invoice extract",
      countLabel: `${supplierInvoices.length} documents`,
      notes: "Representative supplier records for the live demo.",
    },
    {
      fileName: "customer-invoices.json",
      type: "Customer invoice extract",
      countLabel: `${customerInvoices.length} documents`,
      notes: "Receivables used to match incoming payments.",
    },
    {
      fileName: "sales-summary-april.json",
      type: "Cross-check summary",
      countLabel: "1 reference file",
      notes: "Sanity check only, not treated as the source of truth.",
    },
  ];

  return {
    client: CLIENT_CONTEXT,
    rawInputs,
    bankTransactions,
    supplierInvoices,
    customerInvoices,
    salesSummary,
  };
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function sum(items, selector) {
  return roundCurrency(items.reduce((total, item) => total + selector(item), 0));
}

function buildShowcaseView(bundle, intake, bookkeeping, closing) {
  const readySuppliers = bookkeeping.extractions.filter((item) => item.status === "ready");
  const matchedCustomers = bookkeeping.matchedReceivables.filter(
    (item) => item.matchStatus === "matched",
  );
  const revenueGross = sum(bundle.customerInvoices, (item) => item.grossEur);
  const revenueNet = roundCurrency(revenueGross / 1.19);
  const outputVat = roundCurrency(revenueGross - revenueNet);
  const operatingExpensesGross = sum(bundle.supplierInvoices, (item) => item.grossEur);
  const operatingExpensesNet = sum(bundle.supplierInvoices, (item) => item.netEur);
  const inputVat = sum(bundle.supplierInvoices, (item) => item.vatEur);
  const autoMatched = readySuppliers.length + matchedCustomers.length;
  const exceptionCount = bookkeeping.exception ? 1 : 0;
  const documentsParsed = bookkeeping.extractions.length + bookkeeping.matchedReceivables.length;

  return {
    client: bundle.client,
    summary: {
      bankLines: bundle.bankTransactions.length,
      invoiceCount: bundle.supplierInvoices.length + bundle.customerInvoices.length,
      autoMatched,
      exceptions: exceptionCount,
      documentsParsed,
      completeness: intake.completeness,
      operatorNote: intake.operatorNote,
      sourceRisks: intake.sourceRisks,
    },
    bundle: intake.bundle,
    coverage: {
      matchedAutomatically: autoMatched,
      needsReview: exceptionCount,
      documentsParsed,
    },
    transactions: bookkeeping.transactions,
    extractions: bookkeeping.extractions,
    exception: bookkeeping.exception,
    totals: {
      "Revenue gross": revenueGross,
      "Revenue net": revenueNet,
      "Output VAT": outputVat,
      "Operating expenses gross": operatingExpensesGross,
      "Operating expenses net": operatingExpensesNet,
      "Input VAT": inputVat,
      "Net VAT payable": roundCurrency(outputVat - inputVat),
    },
    package: {
      status: closing.packageStatus,
      description: closing.packageDescription,
      items: closing.packageItems,
      clerkTasks: closing.clerkTasks,
      finalNote: closing.finalNote,
    },
  };
}

function extractResponseText(apiResponse) {
  const content = apiResponse.output?.find((item) => item.type === "message")?.content || [];
  const textBlock = content.find((item) => item.type === "output_text");
  if (!textBlock?.text) {
    throw new Error("Model response did not contain structured JSON output.");
  }
  return textBlock.text;
}

async function callAgent({ name, instructions, schema, payload, summarySelector }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to run the live showcase.");
  }

  const startedAt = new Date().toISOString();
  const requestBody = {
    model: MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: instructions }],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `Return JSON only.\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: `${name}_output`,
        strict: true,
        schema,
      },
    },
    max_output_tokens: 1800,
  };

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`${name} failed with ${response.status}: ${errorBody}`);
  }

  const apiResponse = await response.json();
  const parsedOutput = JSON.parse(extractResponseText(apiResponse));
  const completedAt = new Date().toISOString();

  return {
    name,
    model: MODEL,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    responseId: apiResponse.id,
    summary: summarySelector(parsedOutput),
    output: parsedOutput,
  };
}

const intakeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    completeness: {
      type: "string",
      enum: ["Ready for review", "Partial", "Needs follow-up"],
    },
    operatorNote: { type: "string" },
    sourceRisks: {
      type: "array",
      items: { type: "string" },
    },
    bundle: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fileName: { type: "string" },
          type: { type: "string" },
          countLabel: { type: "string" },
          notes: { type: "string" },
        },
        required: ["fileName", "type", "countLabel", "notes"],
      },
    },
  },
  required: ["completeness", "operatorNote", "sourceRisks", "bundle"],
};

const bookkeepingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          counterparty: { type: "string" },
          grossEur: { type: "number" },
          treatment: { type: "string" },
          match: { type: "string" },
        },
        required: ["date", "counterparty", "grossEur", "treatment", "match"],
      },
    },
    extractions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          vendor: { type: "string" },
          fileName: { type: "string" },
          date: { type: "string" },
          netEur: { type: "number" },
          vatEur: { type: "number" },
          grossEur: { type: "number" },
          suggestedAccount: { type: "string" },
          confidence: { type: "string" },
          status: { type: "string", enum: ["ready", "needs_review"] },
        },
        required: [
          "vendor",
          "fileName",
          "date",
          "netEur",
          "vatEur",
          "grossEur",
          "suggestedAccount",
          "confidence",
          "status",
        ],
      },
    },
    matchedReceivables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          invoiceNumber: { type: "string" },
          customer: { type: "string" },
          grossEur: { type: "number" },
          matchStatus: { type: "string", enum: ["matched", "needs_review"] },
        },
        required: ["invoiceNumber", "customer", "grossEur", "matchStatus"],
      },
    },
    exception: {
      type: "object",
      additionalProperties: false,
      properties: {
        document: { type: "string" },
        reason: { type: "string" },
        amountEur: { type: "number" },
        risk: { type: "string" },
        suggestedAction: { type: "string" },
      },
      required: ["document", "reason", "amountEur", "risk", "suggestedAction"],
    },
  },
  required: ["transactions", "extractions", "matchedReceivables", "exception"],
};

const closingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    packageStatus: { type: "string" },
    packageDescription: { type: "string" },
    packageItems: {
      type: "array",
      items: { type: "string" },
    },
    clerkTasks: {
      type: "array",
      items: { type: "string" },
    },
    finalNote: { type: "string" },
  },
  required: [
    "packageStatus",
    "packageDescription",
    "packageItems",
    "clerkTasks",
    "finalNote",
  ],
};

async function persistArtifact(artifact) {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
  const stamp = artifact.completedAt.replace(/[:.]/g, "-");
  const versionedFileName = `run-${stamp}.json`;
  const versionedPath = path.join(RUNTIME_DIR, versionedFileName);
  const latestPath = path.join(RUNTIME_DIR, "latest-run.json");
  const payload = JSON.stringify(artifact, null, 2);

  await Promise.all([
    fs.writeFile(versionedPath, payload),
    fs.writeFile(latestPath, payload),
  ]);

  return {
    latestRelativePath: "./runtime/latest-run.json",
    versionedRelativePath: `./runtime/${versionedFileName}`,
  };
}

async function runShowcaseFlow() {
  const bundle = await loadSourceBundle();
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const intake = await callAgent({
    name: "intake_agent",
    instructions:
      "You are the intake agent for a German Steuerkanzlei showcase. Assess only the provided source bundle. Do not invent missing files or broader month totals. Be explicit that JSON and CSV extracts are the live demo source material.",
    schema: intakeSchema,
    payload: {
      task: "Assess the source bundle before bookkeeping starts.",
      client: bundle.client,
      files: bundle.rawInputs,
    },
    summarySelector: (output) => output.operatorNote,
  });

  const bookkeeping = await callAgent({
    name: "bookkeeping_agent",
    instructions:
      "You are the bookkeeping agent for a narrow monthly close demo. Use only the provided transactions and invoice extracts. Produce a bookkeeping-ready view, keep one exception for the Metro file, and do not invent invoices outside this source set.",
    schema: bookkeepingSchema,
    payload: {
      task: "Classify the month, match the payments, and surface the one exception.",
      client: bundle.client,
      intakeAssessment: intake.output,
      bankTransactions: bundle.bankTransactions,
      supplierInvoices: bundle.supplierInvoices,
      customerInvoices: bundle.customerInvoices,
    },
    summarySelector: (output) =>
      `${output.extractions.length} supplier documents classified, ${output.matchedReceivables.length} receivables matched.`,
  });

  const closing = await callAgent({
    name: "closing_agent",
    instructions:
      "You are the closing-packaging agent. Build a concise handoff package for the case handler using only the provided bookkeeping outputs. Keep the handoff honest: this demo covers the supplied extracts, not a full production month ingestion.",
    schema: closingSchema,
    payload: {
      task: "Produce the review-ready closing package and clerk follow-up.",
      client: bundle.client,
      intakeAssessment: intake.output,
      bookkeepingOutput: bookkeeping.output,
      salesCrossCheck: bundle.salesSummary,
    },
    summarySelector: (output) => output.packageDescription,
  });

  const completedAt = new Date().toISOString();
  const showcase = buildShowcaseView(
    bundle,
    intake.output,
    bookkeeping.output,
    closing.output,
  );
  const artifact = {
    runId,
    startedAt,
    completedAt,
    durationMs:
      new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    sourceBundle: {
      sourceLabel: "April 2026 live source bundle",
      inputFiles: bundle.rawInputs,
      note: "The live run executes on the CSV/JSON source files available in this workspace.",
    },
    stages: [intake, bookkeeping, closing],
    showcase,
  };

  artifact.artifacts = await persistArtifact(artifact);
  return artifact;
}

async function serveStatic(request, response, pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.normalize(path.join(ROOT_DIR, relativePath));
  if (!resolvedPath.startsWith(ROOT_DIR)) {
    respondJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      respondJson(response, 404, { error: "Not found" });
      return;
    }

    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    });
    createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    respondJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts[0] === "api" && pathParts[1] === "buchungsdaten") {
    try {
      const store = await sharedBuchungsdatenStorePromise;

      if (request.method === "GET" && pathParts[2] === "health" && pathParts.length === 3) {
        respondJson(response, 200, store.getHealth());
        return;
      }

      if (request.method === "GET" && pathParts[2] === "account-catalog" && pathParts.length === 3) {
        const chartType = url.searchParams.get("chartType") || "SKR03";
        respondJson(response, 200, {
          chartType,
          supportedCharts: SUPPORTED_CHART_TYPES,
          accounts: store.listAccountCatalog(chartType),
        });
        return;
      }

      if (request.method === "GET" && pathParts[2] === "mandanten" && pathParts.length === 3) {
        respondJson(response, 200, {
          supportedCharts: SUPPORTED_CHART_TYPES,
          mandanten: store.listMandanten(),
        });
        return;
      }

      if (request.method === "POST" && pathParts[2] === "mandanten" && pathParts.length === 3) {
        const payload = await parseJsonBody(request);
        if (!payload.id || !payload.legalName || !payload.displayName || !payload.legalEntity) {
          respondJson(response, 400, {
            error: "id, legalName, displayName, and legalEntity are required.",
          });
          return;
        }

        store.upsertMandant(payload);
        await store.save();
        respondJson(response, 201, { mandant: store.getMandant(payload.id) });
        return;
      }

      if (request.method === "GET" && pathParts[2] === "mandanten" && pathParts.length === 4) {
        const mandant = store.getMandant(pathParts[3]);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }
        respondJson(response, 200, { mandant });
        return;
      }

      if (
        request.method === "GET" &&
        pathParts[2] === "mandanten" &&
        pathParts[4] === "buchungen" &&
        pathParts.length === 5
      ) {
        const mandantId = pathParts[3];
        const mandant = store.getMandant(mandantId);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }

        const chartType = url.searchParams.get("chartType") || "SKR03";
        respondJson(response, 200, {
          mandant,
          chartType,
          supportedCharts: SUPPORTED_CHART_TYPES,
          buchungen: store.listBookings(mandantId, chartType),
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathParts[2] === "mandanten" &&
        pathParts[4] === "buchungen" &&
        pathParts.length === 5
      ) {
        const mandantId = pathParts[3];
        const mandant = store.getMandant(mandantId);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }

        const payload = await parseJsonBody(request);
        const booking = store.createBooking({
          ...payload,
          mandantId,
        });
        await store.save();
        respondJson(response, 201, { booking });
        return;
      }

      respondJson(response, 404, { error: "Buchungsdaten endpoint not found." });
      return;
    } catch (error) {
      const statusCode =
        /required|Unsupported|not found|must include/i.test(error.message) ? 400 : 500;
      respondJson(response, statusCode, { error: error.message });
      return;
    }
  }

  if (pathParts[0] === "api" && pathParts[1] === "telegram") {
    try {
      const store = await sharedBuchungsdatenStorePromise;

      if (
        request.method === "GET" &&
        pathParts[2] === "bots" &&
        pathParts[3] === "status" &&
        pathParts.length === 4
      ) {
        const config = await getTelegramBotConfig();
        respondJson(response, 200, describeBotConfig(config));
        return;
      }

      if (
        request.method === "POST" &&
        pathParts[2] === "bots" &&
        pathParts[4] === "webhook" &&
        pathParts.length === 5
      ) {
        const botKey = pathParts[3];
        const chartType = url.searchParams.get("chartType") || "SKR03";
        const update = await parseJsonBody(request);
        const result = await handleTelegramBotWebhook({
          botKey,
          update,
          store,
          chartType,
        });
        respondJson(response, 200, {
          ok: true,
          botKey,
          chartType,
          result,
        });
        return;
      }

      if (
        request.method === "POST" &&
        pathParts[2] === "intake" &&
        pathParts.length === 3
      ) {
        const payload = await parseJsonBody(request);
        if (payload.mandant && !store.getMandant(payload.mandant.id)) {
          store.upsertMandant(payload.mandant);
        }

        const chartType = url.searchParams.get("chartType") || "SKR03";
        const submission = normalizeTelegramSubmission(payload);
        const result = store.ingestTelegramSubmission(submission, chartType);
        await store.save();
        const workflowRunDraft = createTelegramWorkflowRun(result, {
          chartType,
          trigger: "telegram_intake_api",
        });
        const workflowRun = await writeTelegramWorkflowRun(workflowRunDraft);
        respondJson(response, 201, {
          chartType,
          supportedCharts: SUPPORTED_CHART_TYPES,
          workflowRun,
          ...result,
        });
        return;
      }

      if (
        request.method === "GET" &&
        pathParts[2] === "mandanten" &&
        pathParts[4] === "workflow-runs" &&
        pathParts.length === 5
      ) {
        const mandantId = pathParts[3];
        const mandant = store.getMandant(mandantId);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }

        respondJson(response, 200, {
          mandant,
          workflowRuns: await listTelegramWorkflowRuns(mandantId),
        });
        return;
      }

      if (
        request.method === "GET" &&
        pathParts[2] === "mandanten" &&
        pathParts[4] === "submissions" &&
        pathParts.length === 5
      ) {
        const mandantId = pathParts[3];
        const mandant = store.getMandant(mandantId);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }

        respondJson(response, 200, {
          mandant,
          submissions: store.listTelegramSubmissions(mandantId),
        });
        return;
      }

      if (
        request.method === "GET" &&
        pathParts[2] === "mandanten" &&
        pathParts[4] === "documents" &&
        pathParts.length === 5
      ) {
        const mandantId = pathParts[3];
        const mandant = store.getMandant(mandantId);
        if (!mandant) {
          respondJson(response, 404, { error: "Mandant not found." });
          return;
        }

        const chartType = url.searchParams.get("chartType") || "SKR03";
        respondJson(response, 200, {
          mandant,
          chartType,
          supportedCharts: SUPPORTED_CHART_TYPES,
          documents: store.listTelegramDocuments(mandantId, chartType),
        });
        return;
      }

      respondJson(response, 404, { error: "Telegram intake endpoint not found." });
      return;
    } catch (error) {
      const statusCode =
        /required|Unsupported|not found|must include/i.test(error.message) ? 400 : 500;
      respondJson(response, statusCode, { error: error.message });
      return;
    }
  }

  if (request.method === "GET" && url.pathname === "/api/demo/latest") {
    try {
      const latest = await fs.readFile(path.join(RUNTIME_DIR, "latest-run.json"), "utf8");
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(latest);
    } catch (error) {
      respondJson(response, 404, {
        error: "No live showcase run has been recorded yet.",
      });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/demo/run") {
    if (activeRun) {
      respondJson(response, 409, {
        error: "A showcase run is already in progress.",
      });
      return;
    }

    activeRun = runShowcaseFlow();
    try {
      const artifact = await activeRun;
      respondJson(response, 200, artifact);
    } catch (error) {
      respondJson(response, 500, {
        error: error.message,
      });
    } finally {
      activeRun = null;
    }
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response, url.pathname);
    return;
  }

  respondJson(response, 405, { error: "Method not allowed." });
});

server.listen(PORT, HOST, () => {
  console.log(`Showcase server listening on http://${HOST}:${PORT}`);
});
