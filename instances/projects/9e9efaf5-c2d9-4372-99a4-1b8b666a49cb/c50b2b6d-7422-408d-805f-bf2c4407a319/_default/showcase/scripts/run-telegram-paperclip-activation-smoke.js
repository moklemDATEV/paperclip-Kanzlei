#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { CLIENT_CONTEXT, createSharedBuchungsdatenStore } = require("../db/shared-buchungsdaten");
const { handleTelegramBotWebhook } = require("../telegram-bots");
const {
  activatePaperclipAgentsForWorkflowRun,
  activatePaperclipIssueForTelegramTicket,
} = require("../paperclip-activation");
const { executeTelegramIntakeHandoff } = require("../telegram-intake-handoff");
const { executePaperclipWorkflowHandoff, parseArgs } = require("../paperclip-workflow-handoff");

const ROOT_DIR = path.join(__dirname, "..");
const FIXTURE_PATH = path.join(ROOT_DIR, "data", "telegram-mandant-webhook.json");

async function withMockPaperclipServer(run) {
  const requests = [];
  let issueCounter = 1;
  const issues = new Map();
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
      response.end(JSON.stringify([
        { id: "ceo-agent", name: "CEO", urlKey: "ceo" },
        { id: "mandant-agent", name: "Mandant Intake", urlKey: "mandant-intake" },
        { id: "doc-agent", name: "Document Ingestion", urlKey: "document-ingestion" },
        { id: "book-agent", name: "Bookkeeping Reconciliation", urlKey: "bookkeeping-reconciliation" },
        { id: "tax-agent", name: "Tax Preparation", urlKey: "tax-preparation" },
        { id: "compliance-agent", name: "Compliance Guard", urlKey: "compliance-guard" },
        { id: "review-agent", name: "Steuerberater Review Copilot", urlKey: "steuerberater-review-copilot" },
        { id: "client-agent", name: "Client Communication", urlKey: "client-communication" },
        { id: "cto-agent", name: "CTO", urlKey: "cto" },
      ]));
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
      const issueId = `issue-${issueCounter}`;
       const issue = {
        id: issueId,
        identifier: `DAT-MOCK-${issueCounter}`,
        title: payload.title,
        description: payload.description,
        status: payload.status || "todo",
        assigneeAgentId: payload.assigneeAgentId || null,
        projectId: payload.projectId || null,
        goalId: payload.goalId || null,
        parentId: payload.parentId || null,
        createdAt: "2026-06-01T00:00:00.000Z",
      };
      issues.set(issueId, issue);
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(issue));
      issueCounter += 1;
      return;
    }

    if (request.method === "GET" && /^\/api\/issues\/issue-\d+$/.test(request.url)) {
      const issue = issues.get(request.url.split("/").pop());
      if (!issue) {
        response.writeHead(404, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify(issue));
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
      const payload = JSON.parse(body || "{}");
      const issueId = request.url.split("/").pop();
      const issue = issues.get(issueId);
      if (issue) {
        issues.set(issueId, {
          ...issue,
          ...payload,
        });
      }
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

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "telegram-paperclip-activation-"));
  process.env.SHOWCASE_RUNTIME_DIR = tempDir;
  process.env.TELEGRAM_DISABLE_SEND = "1";
  process.env.TELEGRAM_DEFAULT_MANDANT_ID = CLIENT_CONTEXT.id;
  process.env.MANDANT_CHAT_ID = "8695197922";
  process.env.MANDANT_BOT_USERNAME = "Mandat_Paper_bot";

  await withMockPaperclipServer(async ({ origin, requests }) => {
    process.env.SHOWCASE_PAPERCLIP_API_URL = origin;
    process.env.SHOWCASE_PAPERCLIP_API_KEY = "test-key";
    process.env.SHOWCASE_PAPERCLIP_COMPANY_ID = "test-company";
    process.env.SHOWCASE_PAPERCLIP_ACTIVATION_ENABLED = "1";
    process.env.PAPERCLIP_TASK_ID = "source-issue";
    const parsedExplicitIssueArgs = parseArgs(["issue-override", "--next-owner", "Bookkeeping Reconciliation"]);
    if (parsedExplicitIssueArgs.issueId !== "issue-override") {
      throw new Error("Expected an explicit workflow handoff issue id to override PAPERCLIP_TASK_ID.");
    }
    const config = {
      paperclipActivation: {
        enabled: "1",
        apiUrl: origin,
        apiKey: "test-key",
        companyId: "test-company",
        runId: "smoke-run",
      },
    };

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

    if (!result.ticket?.paperclipIssueIdentifier) {
      throw new Error("Expected webhook fixture to create a Paperclip intake issue.");
    }
    if (!result.workflowRun) {
      throw new Error("Expected webhook fixture to persist a workflow run.");
    }
    if (result.workflowRun.activations.length !== 0) {
      throw new Error(`Expected no downstream workflow issue during webhook intake, received ${result.workflowRun.activations.length}.`);
    }

    const intakeRequest = requests.find(
      (request) => request.method === "POST" && request.url === "/api/companies/test-company/issues",
    );
    if (!intakeRequest) {
      throw new Error("Expected a POST /api/companies/test-company/issues activation request.");
    }

    const issuePayloads = requests
      .filter((request) => request.method === "POST" && request.url === "/api/companies/test-company/issues")
      .map((request) => JSON.parse(request.body || "{}"));
    const intakePayload = issuePayloads.find((payload) => payload.assigneeAgentId === "mandant-agent");
    if (!intakePayload) {
      throw new Error("Expected a Mandant Intake issue creation request.");
    }
    const workflowPayload = issuePayloads.find((payload) => payload.title === "Telegram intake: amazon-rechnung-mai.pdf");
    if (workflowPayload) {
      throw new Error("Did not expect a downstream workflow issue during webhook intake.");
    }

    const descriptionPatch = requests.find(
      (request) => request.method === "PATCH" && request.url === "/api/issues/issue-1",
    );
    if (!descriptionPatch) {
      throw new Error("Expected the intake issue description to be patched with workflow handoff details.");
    }
    const descriptionPatchPayload = JSON.parse(descriptionPatch.body || "{}");
    if (!descriptionPatchPayload.description.includes("Workflow handoff")) {
      throw new Error("Expected workflow handoff details in the intake issue description patch.");
    }
    if (descriptionPatchPayload.status != null) {
      throw new Error("Did not expect the intake issue to close automatically during webhook intake.");
    }
    if (!descriptionPatchPayload.description.includes("handoffCommand: node showcase/scripts/handoff-telegram-intake-issue.js")) {
      throw new Error("Expected the intake issue description to show the explicit handoff command.");
    }
    if (!descriptionPatchPayload.description.includes("activationMode: downstream_activation_pending_explicit_handoff")) {
      throw new Error("Expected the intake issue description to show the pending explicit handoff mode.");
    }
    if (!descriptionPatchPayload.description.includes("- periodClarificationRule: Do not open a mandant accounting-period clarification")) {
      throw new Error("Expected the intake issue description to require source extraction before accounting-period clarification.");
    }
    if (!descriptionPatchPayload.description.includes("- staleClarificationRule: If extraction later records `bookingMonth`")) {
      throw new Error("Expected the intake issue description to require stale clarification supersession after extraction.");
    }

    const handoffResult = await executeTelegramIntakeHandoff({
      config,
      issueId: "issue-1",
      showcaseDir: ROOT_DIR,
    });
    if (handoffResult.activationCount !== 1) {
      throw new Error(`Expected one downstream workflow issue after explicit handoff, received ${handoffResult.activationCount}.`);
    }

    const patchPayloads = requests
      .filter((request) => request.method === "PATCH" && request.url === "/api/issues/issue-1")
      .map((request) => JSON.parse(request.body || "{}"));
    const completionPatch = patchPayloads.find((payload) => payload.status === "done");
    if (!completionPatch) {
      throw new Error("Expected explicit handoff to close the intake issue.");
    }
    if (!completionPatch.description.includes("- downstreamIssue: DAT-MOCK-2 -> Document Ingestion")) {
      throw new Error("Expected explicit handoff to record the downstream workflow issue.");
    }
    if (!completionPatch.comment?.includes("Automatic Telegram handoff completed.")) {
      throw new Error("Expected explicit handoff to confirm the automatic handoff comment.");
    }

    const samplePdfPath = path.join(tempDir, "sample-telegram-source.pdf");
    await fs.writeFile(samplePdfPath, Buffer.from("%PDF-1.4\n%mock\n", "utf8"));

    const attachmentTicketActivation = await activatePaperclipIssueForTelegramTicket({
      config,
      route: {
        issueTypeLabel: "internal_intake",
        routeLabel: "Mandant Intake",
        routeKey: "internal_intake",
        selectionMode: "channel_default",
      },
      ticket: {
        channel: "mandant",
        telegramChatId: "8695197922",
        telegramMessageId: "777",
        senderName: "Lisa Berg",
        mandantId: CLIENT_CONTEXT.id,
        unmatchedMandant: false,
        intent: "mandant_default",
        messageBody: "",
        metadata: {
          receivedAt: "2026-06-17T13:00:00.000Z",
          selectionMode: "channel_default",
          issueTitle: "Telegram mandant: sample-telegram-source.pdf",
        },
        attachments: [{
          kind: "document",
          fileName: "sample-telegram-source.pdf",
          telegramFileId: "tg-sample-777",
          documentId: "doc-sample-777",
          sourceLink: samplePdfPath,
        }],
      },
      intakeResult: {
        submission: {
          id: "submission-sample-777",
        },
        documents: [{
          id: "doc-sample-777",
          fileName: "sample-telegram-source.pdf",
          documentType: "supplier_invoice",
          status: "ready",
          sourceLink: samplePdfPath,
        }],
      },
    });
    const sampleWorkflowActivations = await activatePaperclipAgentsForWorkflowRun({
      config,
      workflowRun: {
        id: "workflow-sample-777",
        trigger: "telegram_webhook",
        source: {
          sourceLabel: "Telegram webhook intake",
        },
        submission: {
          id: "submission-sample-777",
        },
        routes: [{
          documentId: "doc-sample-777",
          fileName: "sample-telegram-source.pdf",
          sourceLink: samplePdfPath,
          documentType: "supplier_invoice",
          status: "ready",
          downstreamPath: "bookkeeping:extract_fields",
          queue: "extraction_queue",
          reason: "Attachment upload smoke route.",
        }],
      },
    });

    const attachmentRequests = requests.filter(
      (request) =>
        request.method === "POST"
        && /^\/api\/companies\/test-company\/issues\/issue-\d+\/attachments$/.test(request.url),
    );
    if (attachmentRequests.length < 2) {
      throw new Error("Expected attachment uploads for both the intake issue and downstream workflow issue.");
    }
    if (!attachmentTicketActivation.issueDescription.includes(`sourceLink=${samplePdfPath}`)) {
      throw new Error("Expected the intake issue description to include the local sourceLink.");
    }

    const refreshedIssuePayloads = requests
      .filter((request) => request.method === "POST" && request.url === "/api/companies/test-company/issues")
      .map((request) => JSON.parse(request.body || "{}"));
    const sampleWorkflowPayload = refreshedIssuePayloads.find(
      (payload) => payload.title === "Telegram intake: sample-telegram-source.pdf",
    );
    if (!sampleWorkflowPayload) {
      throw new Error("Expected a workflow activation payload for the sample PDF.");
    }
    if (!sampleWorkflowPayload.description.includes(`- sourceLink: ${samplePdfPath}`)) {
      throw new Error("Expected the workflow issue description to include the local sourceLink.");
    }
    if (!sampleWorkflowPayload.description.includes('handoffCommand: node showcase/scripts/handoff-paperclip-workflow-issue.js --next-owner "Bookkeeping Reconciliation"')) {
      throw new Error("Expected the workflow issue description to include the generic workflow handoff command.");
    }
    if (!sampleWorkflowPayload.description.includes("- issueApiAccess: Use the Paperclip heartbeat environment")) {
      throw new Error("Expected the workflow issue description to state that Paperclip API access comes from the heartbeat environment.");
    }
    if (!sampleWorkflowPayload.description.includes("- handoffAssignmentRule: A handoff is complete only when the downstream issue is created with assigneeAgentId set")) {
      throw new Error("Expected the workflow issue description to require assigned downstream handoff creation.");
    }
    if (!sampleWorkflowPayload.description.includes("- blockingRule: Do not mark this issue blocked when another internal agent can continue or obtain the missing evidence.")) {
      throw new Error("Expected the workflow issue description to prefer handoff over blocked status.");
    }
    if (!sampleWorkflowPayload.description.includes("- periodClarificationRule: Do not open a mandant accounting-period clarification")) {
      throw new Error("Expected the workflow issue description to require extraction-first accounting-period handling.");
    }
    if (!sampleWorkflowPayload.description.includes("- staleClarificationRule: If extraction later records `bookingMonth`")) {
      throw new Error("Expected the workflow issue description to require stale clarification supersession.");
    }

    const sampleSummaryPath = path.join(tempDir, "sample-workflow-summary.md");
    await fs.writeFile(sampleSummaryPath, "# Sample handoff summary\n");
    const workflowHandoffResult = await executePaperclipWorkflowHandoff({
      config,
      issueId: "issue-4",
      summaryFile: sampleSummaryPath,
    });
    if (workflowHandoffResult.nextOwner !== "Bookkeeping Reconciliation") {
      throw new Error(`Expected workflow handoff to resolve Bookkeeping Reconciliation, received ${workflowHandoffResult.nextOwner}.`);
    }

    const workflowIssuePayloads = requests
      .filter((request) => request.method === "POST" && request.url === "/api/companies/test-company/issues")
      .map((request) => JSON.parse(request.body || "{}"));
    const workflowFollowupPayload = workflowIssuePayloads.find(
      (payload) => payload.assigneeAgentId === "book-agent" && payload.parentId === "issue-4",
    );
    if (!workflowFollowupPayload) {
      throw new Error("Expected workflow handoff to create a bookkeeping follow-up issue.");
    }

    const blockedSourceIssueResponse = await fetch(`${origin}/api/companies/test-company/issues`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
        "X-Paperclip-Run-Id": "smoke-run",
      },
      body: JSON.stringify({
        title: "Blocked workflow handoff fixture",
        description: [
          "Automatically created by workflow handoff test.",
          "",
          "Source",
          "- documentId: doc-blocked-1",
          "",
          "Routing",
          "- queue: blocked_queue",
          "",
          "Workflow contract",
          "- currentOwner: Document Ingestion",
          "- completionRule: Hand the work off explicitly.",
          "- nextOwner: Imaginary Owner",
        ].join("\n"),
        status: "todo",
        priority: "medium",
        assigneeAgentId: "doc-agent",
      }),
    });
    const blockedSourceIssue = await blockedSourceIssueResponse.json();
    const reroutedHandoff = await executePaperclipWorkflowHandoff({
      config,
      issueId: blockedSourceIssue.id,
    });
    if (reroutedHandoff.routedToCto !== true || reroutedHandoff.missingMapping !== "Imaginary Owner") {
      throw new Error("Expected missing workflow owner mapping to reroute the source issue to CTO.");
    }

    console.log(JSON.stringify({
      ticket: {
        routeKey: result.ticket.routeKey,
        assigneeAgentName: result.ticket.assigneeAgentName,
        issueIdentifier: result.ticket.paperclipIssueIdentifier,
        submissionId: result.ticket.submissionId,
      },
      workflowRun: {
        id: result.workflowRun.id,
        routes: result.workflowRun.routes.map((route) => route.downstreamPath),
        activations: handoffResult.activationIssueIdentifiers,
      },
      createdIssues: {
        intake: {
          title: intakePayload.title,
          assigneeAgentId: intakePayload.assigneeAgentId,
          projectId: intakePayload.projectId,
          goalId: intakePayload.goalId,
          parentId: intakePayload.parentId,
        },
      },
      descriptionSync: {
        patchedIssueId: "issue-1",
        includesWorkflowHandoff: true,
      },
      attachmentUploadCount: attachmentRequests.length,
      directActivation: {
        intakeIssueIdentifier: attachmentTicketActivation.issueIdentifier,
        workflowIssueIdentifier: sampleWorkflowActivations[0]?.issueIdentifier || null,
        workflowFollowupIssueIdentifier: workflowHandoffResult.followupIssueIdentifier,
      },
      auditStages: result.auditEvents.map((event) => event.stage),
    }, null, 2));
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
