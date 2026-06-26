#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CLIENT_CONTEXT, createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");

const ROOT_DIR = path.join(__dirname, "..");
const MANDANT_FIXTURE_PATH = path.join(ROOT_DIR, "data", "telegram-mandant-webhook.json");

async function withMockPaperclipServer(run) {
  const requests = [];
  let issueCounter = 1;
  let forcedFailureUsed = false;

  const agents = [
    { id: "ceo-agent", name: "CEO", urlKey: "ceo" },
    { id: "mandant-agent", name: "Mandant Intake", urlKey: "mandant-intake" },
    { id: "doc-agent", name: "Document Ingestion", urlKey: "document-ingestion" },
    { id: "book-agent", name: "Bookkeeping Reconciliation", urlKey: "bookkeeping-reconciliation" },
    { id: "tax-agent", name: "Tax Preparation", urlKey: "tax-preparation" },
    { id: "compliance-agent", name: "Compliance Guard", urlKey: "compliance-guard" },
    { id: "review-agent", name: "Steuerberater Review Copilot", urlKey: "steuerberater-review-copilot" },
    { id: "client-agent", name: "Client Communication", urlKey: "client-communication" },
    { id: "cto-agent", name: "CTO", urlKey: "cto" },
  ];

  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(chunk);
    }
    const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : "";
    requests.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body,
    });

    if (request.method === "GET" && request.url === "/api/companies/test-company/agents") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(agents));
      return;
    }

    if (request.method === "GET" && request.url === "/api/issues/source-issue/heartbeat-context") {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        issue: {
          id: "source-issue",
          projectId: "derived-project",
          goalId: "derived-goal",
        },
      }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/companies/test-company/issues") {
      const payload = JSON.parse(body || "{}");
      if (
        payload.description.includes("force-fallback")
        && payload.assigneeAgentId !== "ceo-agent"
        && forcedFailureUsed === false
      ) {
        forcedFailureUsed = true;
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "forced routing failure" }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({
        id: `issue-${issueCounter}`,
        identifier: `DAT-MOCK-${issueCounter}`,
        title: payload.title,
        createdAt: `2026-06-02T00:00:0${issueCounter}.000Z`,
      }));
      issueCounter += 1;
      return;
    }

    if (
      request.method === "POST"
      && /^\/api\/companies\/test-company\/issues\/issue-\d+\/attachments$/.test(request.url)
    ) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method === "PATCH" && /^\/api\/issues\/issue-\d+$/.test(request.url)) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    return await run({
      origin: `http://${address.address}:${address.port}`,
      requests,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function createKanzleiUpdate(messageId, text) {
  return {
    update_id: 910000000 + messageId,
    message: {
      message_id: messageId,
      date: 1777662600 + messageId,
      chat: {
        id: -5180198176,
        type: "supergroup",
        title: "Kanzlei Nordstern Review",
      },
      from: {
        id: 712345001,
        is_bot: false,
        first_name: "Maria",
        last_name: "Schneider",
        username: "maria_schneider",
      },
      text,
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "telegram-routing-tickets-"));
  process.env.SHOWCASE_RUNTIME_DIR = tempDir;
  process.env.TELEGRAM_DISABLE_SEND = "1";
  process.env.TELEGRAM_DEFAULT_MANDANT_ID = CLIENT_CONTEXT.id;
  process.env.MANDANT_CHAT_ID = "8695197922";
  process.env.MANDANT_BOT_USERNAME = "Mandat_Paper_bot";
  process.env.KANZLEI_CHAT_ID = "-5180198176";
  process.env.KANZLEI_BOT_USERNAME = "Kanzlei_Paper_Bot";
  process.env.PAPERCLIP_TASK_ID = "source-issue";

  await withMockPaperclipServer(async ({ origin, requests }) => {
    process.env.SHOWCASE_PAPERCLIP_API_URL = origin;
    process.env.SHOWCASE_PAPERCLIP_API_KEY = "test-key";
    process.env.SHOWCASE_PAPERCLIP_COMPANY_ID = "test-company";
    process.env.SHOWCASE_PAPERCLIP_ACTIVATION_ENABLED = "1";

    const { handleTelegramBotWebhook, getTelegramBotConfig, sendApprovedClientReply } = require("../telegram-bots");
    const config = await getTelegramBotConfig();
    const store = await createSharedBuchungsdatenStore({
      filePath: path.join(tempDir, "shared-buchungsdaten.sqlite"),
      reseed: true,
    });

    const mandantUpdate = JSON.parse(await fs.readFile(MANDANT_FIXTURE_PATH, "utf8"));
    const alternateMandantUpdate = {
      ...mandantUpdate,
      update_id: 900100099,
      message: {
        ...mandantUpdate.message,
        message_id: 699,
        chat: {
          ...mandantUpdate.message.chat,
          id: 9912345678,
          username: "new_client_chat",
        },
        from: {
          ...mandantUpdate.message.from,
          id: 9912345678,
          username: "new_client_chat",
          first_name: "New",
          last_name: "Client",
        },
      },
    };
    const cases = [
      {
        name: "mandant-default",
        botKey: "mandant",
        update: mandantUpdate,
        expectedRoute: "internal_intake",
        expectedAssignee: "Mandant Intake",
      },
      {
        name: "mandant-private-chat-not-preconfigured",
        botKey: "mandant",
        update: alternateMandantUpdate,
        expectedRoute: "internal_intake",
        expectedAssignee: "Mandant Intake",
      },
      {
        name: "docs-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(702, "@docs Bitte OCR auf diesen Beleg anwenden"),
        expectedRoute: "doc_processing",
        expectedAssignee: "Document Ingestion",
      },
      {
        name: "reco-intent",
        botKey: "kanzlei",
        update: createKanzleiUpdate(703, "Please reconcile this bank movement against April invoices"),
        expectedRoute: "reconciliation",
        expectedAssignee: "Bookkeeping Reconciliation",
      },
      {
        name: "tax-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(704, "@tax Bitte Umsatzsteuer vorbereiten"),
        expectedRoute: "tax_draft",
        expectedAssignee: "Tax Preparation",
      },
      {
        name: "compliance-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(705, "@compliance Bitte Policy-Freigabe pruefen"),
        expectedRoute: "compliance_check",
        expectedAssignee: "Compliance Guard",
      },
      {
        name: "review-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(706, "@review Bitte fuer Steuerberater verpacken"),
        expectedRoute: "review_package",
        expectedAssignee: "Steuerberater Review Copilot",
      },
      {
        name: "outbound-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(707, "@outbound Bitte an den Mandanten rueckmelden"),
        expectedRoute: "outbound_request",
        expectedAssignee: "Client Communication",
      },
      {
        name: "tech-explicit",
        botKey: "kanzlei",
        update: createKanzleiUpdate(708, "@cto webhook error after deploy"),
        expectedRoute: "tech",
        expectedAssignee: "CTO",
      },
      {
        name: "triage-fallback",
        botKey: "kanzlei",
        update: createKanzleiUpdate(709, "Someone should probably look at this"),
        expectedRoute: "triage",
        expectedAssignee: "CEO",
      },
      {
        name: "forced-fallback",
        botKey: "kanzlei",
        update: createKanzleiUpdate(710, "@docs force-fallback"),
        expectedRoute: "doc_processing",
        expectedFallbackAssignee: "CEO",
      },
    ];

    const results = [];
    for (const testCase of cases) {
      const result = await handleTelegramBotWebhook({
        botKey: testCase.botKey,
        update: testCase.update,
        store,
        chartType: "SKR03",
      });
      const ticket = result.ticket;
      const auditStages = result.auditEvents.map((event) => event.stage);
      results.push({
        name: testCase.name,
        routeKey: ticket.routeKey,
        assignee: ticket.assigneeAgentName,
        action: result.action || null,
        responseText: result.response?.text || null,
        issueIdentifier: ticket.paperclipIssueIdentifier,
        duplicate: Boolean(result.duplicate),
        fallbackUsed: Boolean(ticket.fallbackUsed),
        unmatchedMandant: Boolean(ticket.unmatchedMandant),
        auditStages,
      });

      assert(ticket, `Expected ticket for ${testCase.name}`);
      assert(ticket.paperclipIssueIdentifier, `Expected Paperclip issue for ${testCase.name}`);
      assert(ticket.routeKey === testCase.expectedRoute, `Unexpected route for ${testCase.name}`);
      if (testCase.expectedAssignee) {
        assert(ticket.assigneeAgentName === testCase.expectedAssignee, `Unexpected assignee for ${testCase.name}`);
      }
      if (testCase.expectedFallbackAssignee) {
        assert(ticket.assigneeAgentName === testCase.expectedFallbackAssignee, `Expected fallback assignee for ${testCase.name}`);
        assert(ticket.fallbackUsed === true, `Expected fallback flag for ${testCase.name}`);
      }
      assert(auditStages.includes("route_selected"), `Missing route audit for ${testCase.name}`);
      assert(auditStages.includes("paperclip_issue_created") || auditStages.includes("fallback_issue_created"), `Missing assignment audit for ${testCase.name}`);
      if (testCase.botKey === "mandant") {
        assert(auditStages.includes("workflow_handoff_prepared"), `Missing workflow handoff audit for ${testCase.name}`);
        assert(!auditStages.includes("workflow_handoff_sync_failed"), `Unexpected workflow handoff sync failure for ${testCase.name}`);
        assert(result.workflowRun?.routes?.length >= 1, `Expected workflow run for ${testCase.name}`);
        assert(result.workflowRun?.activations?.length === 0, `Expected downstream activation to wait for explicit handoff for ${testCase.name}`);
        assert(result.action === "intake_acknowledgement", `Expected Mandant acknowledgement action for ${testCase.name}`);
        assert(result.response?.dryRun === true, `Expected dry-run Mandant acknowledgement for ${testCase.name}`);
        assert(
          result.response.text.includes("Danke, wir haben Ihre Unterlagen erhalten."),
          `Expected Mandant receipt acknowledgement text for ${testCase.name}`,
        );
      }
    }

    const duplicateBefore = requests.filter(
      (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
    ).length;
    const duplicateResult = await handleTelegramBotWebhook({
      botKey: "kanzlei",
      update: createKanzleiUpdate(702, "@docs Bitte OCR auf diesen Beleg anwenden"),
      store,
      chartType: "SKR03",
    });
    const duplicateAfter = requests.filter(
      (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
    ).length;
    assert(duplicateResult.duplicate === true, "Expected duplicate routing result");
    assert(duplicateBefore === duplicateAfter, "Duplicate message should not create another Paperclip issue");

    const mandantDuplicateBefore = requests.filter(
      (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
    ).length;
    const mandantDuplicateResult = await handleTelegramBotWebhook({
      botKey: "mandant",
      update: mandantUpdate,
      store,
      chartType: "SKR03",
    });
    const mandantDuplicateAfter = requests.filter(
      (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
    ).length;
    assert(mandantDuplicateResult.duplicate === true, "Expected duplicate Mandant routing result");
    assert(mandantDuplicateBefore === mandantDuplicateAfter, "Duplicate Mandant message should not create another Paperclip issue");
    assert(mandantDuplicateResult.action === "duplicate_acknowledgement", "Expected duplicate Mandant acknowledgement action");
    assert(mandantDuplicateResult.response?.dryRun === true, "Expected dry-run duplicate Mandant acknowledgement");
    assert(
      mandantDuplicateResult.response.text.includes("Diese Nachricht liegt uns bereits vor."),
      "Expected duplicate Mandant acknowledgement text",
    );

    const outboundTicket = store.getTelegramMessageTicketByMessageId("707");
    assert(outboundTicket, "Expected outbound ticket");

    let gatingError = null;
    try {
      await sendApprovedClientReply({
        store,
        config,
        ticketId: outboundTicket.id,
        text: "Ihre Unterlagen wurden geprueft.",
      });
    } catch (error) {
      gatingError = error.message;
    }
    assert(gatingError && gatingError.includes("blocked"), "Expected outbound gating failure before approvals");

    store.approveTelegramOutboundStage(outboundTicket.id, "compliance");
    store.approveTelegramOutboundStage(outboundTicket.id, "review");
    const outboundRelease = await sendApprovedClientReply({
      store,
      config,
      ticketId: outboundTicket.id,
      text: "Ihre Unterlagen wurden geprueft.",
    });
    assert(outboundRelease.response.dryRun === true, "Expected dry-run outbound send");

    const mandantTicket = store.getTelegramMessageTicketByMessageId("601");
    const mandantIssueRequests = requests
      .filter((request) => request.method === "POST" && request.url === "/api/companies/test-company/issues")
      .map((request) => JSON.parse(request.body || "{}"))
      .filter((payload) => payload.title.includes("amazon-rechnung-mai.pdf"));
    const mandantTicketPayload = mandantIssueRequests.find((payload) => payload.assigneeAgentId === "mandant-agent");
    const descriptionPatchPayloads = requests.filter(
      (request) => request.method === "PATCH" && /^\/api\/issues\/issue-\d+$/.test(request.url),
    ).map((request) => JSON.parse(request.body || "{}"));
    assert(mandantTicket.submissionId, "Expected Mandant document intake submission");
    assert(mandantTicketPayload, "Expected Mandant intake issue creation request");
    assert(!mandantIssueRequests.some((payload) => payload.title === "Telegram intake: amazon-rechnung-mai.pdf"), "Did not expect a downstream workflow issue during Mandant webhook intake");
    assert(descriptionPatchPayloads.length >= 1, "Expected workflow handoff description sync for Mandant intake issues");
    assert(
      mandantTicketPayload.description.includes("telegram_message_id: 601"),
      "Expected ticket contract metadata in issue description",
    );
    assert(
      descriptionPatchPayloads.some((payload) => payload.description?.includes("- handoffCommand: node showcase/scripts/handoff-telegram-intake-issue.js")),
      "Expected the intake issue description patch to carry the explicit handoff command",
    );
    assert(
      mandantTicketPayload.description.includes("tg-live-amazon-601"),
      "Expected attachment reference in issue description",
    );
    assert(
      descriptionPatchPayloads.every((payload) => payload.status == null),
      "Did not expect the intake issue to close automatically during webhook intake",
    );

    console.log(JSON.stringify({
      routeCoverage: results,
      duplicateSuppressed: true,
      outboundGating: {
        blockedBeforeApproval: true,
        releasedAfterApproval: true,
      },
      auditChecks: {
        mandantTicketAudit: store.listTelegramTicketAuditEvents(mandantTicket.id).map((event) => event.stage),
        fallbackTicketAudit: store.listTelegramTicketAuditEvents(store.getTelegramMessageTicketByMessageId("710").id)
          .map((event) => event.stage),
      },
      issuePostCount: requests.filter(
        (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
      ).length,
    }, null, 2));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
