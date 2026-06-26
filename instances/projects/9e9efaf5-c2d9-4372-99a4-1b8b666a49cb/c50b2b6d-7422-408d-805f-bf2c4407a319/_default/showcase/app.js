const ROUTES = ["intake", "review", "summary", "trace"];

const state = {
  run: null,
  isRunning: false,
};

const elements = {
  runDemoButton: document.querySelector("#run-demo-button"),
  loadLatestButton: document.querySelector("#load-latest-button"),
  fixtureStatus: document.querySelector("#fixture-status"),
  clientName: document.querySelector("#client-name"),
  clientPeriod: document.querySelector("#client-period"),
  metricsGrid: document.querySelector("#metrics-grid"),
  operatorNote: document.querySelector("#operator-note"),
  completenessPill: document.querySelector("#completeness-pill"),
  bundleList: document.querySelector("#bundle-list"),
  coverageCards: document.querySelector("#coverage-cards"),
  transactionTable: document.querySelector("#transaction-table"),
  documentCards: document.querySelector("#document-cards"),
  exceptionPill: document.querySelector("#exception-pill"),
  exceptionCard: document.querySelector("#exception-card"),
  totalsGrid: document.querySelector("#totals-grid"),
  packageCard: document.querySelector("#package-card"),
  clerkTaskList: document.querySelector("#clerk-task-list"),
  runtimeStatus: document.querySelector("#runtime-status"),
  runtimeMeta: document.querySelector("#runtime-meta"),
  runtimeRunId: document.querySelector("#runtime-run-id"),
  artifactLink: document.querySelector("#artifact-link"),
  stageList: document.querySelector("#stage-list"),
  artifactPreview: document.querySelector("#artifact-preview"),
  navLinks: Array.from(document.querySelectorAll(".screen-nav a")),
  screens: Array.from(document.querySelectorAll(".screen")),
};

function formatCurrency(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  return ROUTES.includes(hash) ? hash : "intake";
}

function setActiveRoute() {
  const route = parseRoute();
  elements.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
  elements.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === route);
  });
}

function setRunState(isRunning, label) {
  state.isRunning = isRunning;
  elements.runDemoButton.disabled = isRunning;
  elements.loadLatestButton.disabled = isRunning;
  elements.runDemoButton.textContent = isRunning
    ? "Running live April 2026 flow..."
    : "Run live April 2026 flow";
  if (label) {
    elements.fixtureStatus.textContent = label;
  }
}

function renderMetrics(summary) {
  elements.metricsGrid.innerHTML = `
    <div>
      <p class="metric-label">Bank lines</p>
      <p class="metric-value">${summary.bankLines}</p>
    </div>
    <div>
      <p class="metric-label">Invoices</p>
      <p class="metric-value">${summary.invoiceCount}</p>
    </div>
    <div>
      <p class="metric-label">Auto-matched</p>
      <p class="metric-value">${summary.autoMatched}</p>
    </div>
    <div>
      <p class="metric-label">Exceptions</p>
      <p class="metric-value">${summary.exceptions}</p>
    </div>
  `;
}

function renderBundle(bundle) {
  elements.bundleList.classList.remove("empty-state");
  elements.bundleList.innerHTML = bundle
    .map(
      (item) => `
        <li class="document-row">
          <div>
            <strong>${item.fileName}</strong>
            <div class="muted">${item.type}</div>
          </div>
          <div>
            <strong>${item.countLabel}</strong>
            <div class="muted">${item.notes}</div>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderCoverage(coverage) {
  elements.coverageCards.innerHTML = `
    <div class="coverage-card">
      <p>Matched automatically</p>
      <strong>${coverage.matchedAutomatically}</strong>
    </div>
    <div class="coverage-card">
      <p>Needs review</p>
      <strong>${coverage.needsReview}</strong>
    </div>
    <div class="coverage-card">
      <p>Documents parsed</p>
      <strong>${coverage.documentsParsed}</strong>
    </div>
  `;
}

function renderTransactions(transactions) {
  elements.transactionTable.innerHTML = transactions
    .map(
      (transaction) => `
        <tr>
          <td>${transaction.date}</td>
          <td>${transaction.counterparty}</td>
          <td>${formatCurrency(transaction.grossEur)}</td>
          <td>${transaction.treatment}</td>
          <td>${transaction.match}</td>
        </tr>
      `,
    )
    .join("");
}

function renderDocuments(documents) {
  elements.documentCards.classList.remove("empty-state");
  elements.documentCards.innerHTML = documents
    .map(
      (document) => `
        <article class="document-card">
          <div class="card-topline">
            <div>
              <strong>${document.vendor}</strong>
              <div class="muted">${document.fileName}</div>
            </div>
            <span class="pill ${document.status === "needs_review" ? "warn" : "good"}">
              ${document.status === "needs_review" ? "Needs review" : "Ready"}
            </span>
          </div>
          <div class="card-metadata">
            <span>${document.date}</span>
            <span>${formatCurrency(document.netEur)} net</span>
            <span>${formatCurrency(document.vatEur)} VAT</span>
            <span>${formatCurrency(document.grossEur)} gross</span>
            <span>Account ${document.suggestedAccount}</span>
            <span>Confidence ${document.confidence}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderException(exception) {
  elements.exceptionPill.textContent = "1 exception";
  elements.exceptionPill.className = "pill warn";
  elements.exceptionCard.classList.remove("empty-state");
  elements.exceptionCard.innerHTML = `
    <h5>${exception.document}</h5>
    <p>${exception.reason}</p>
    <ul class="exception-list">
      <li>Amount: ${formatCurrency(exception.amountEur)}</li>
      <li>Risk: ${exception.risk}</li>
      <li>Proposed action: ${exception.suggestedAction}</li>
    </ul>
  `;
}

function renderTotals(totals) {
  elements.totalsGrid.innerHTML = Object.entries(totals)
    .map(
      ([label, amount]) => `
        <div class="total-card">
          <p>${label}</p>
          <strong>${formatCurrency(amount)}</strong>
        </div>
      `,
    )
    .join("");
}

function renderPackage(pkg) {
  elements.packageCard.classList.remove("empty-state");
  elements.packageCard.innerHTML = `
    <h5>${pkg.status}</h5>
    <p>${pkg.description}</p>
    <ul class="package-list">
      ${pkg.items.map((item) => `<li>${item}</li>`).join("")}
    </ul>
    <p><strong>Final note:</strong> ${pkg.finalNote}</p>
  `;
  elements.clerkTaskList.classList.remove("empty-state");
  elements.clerkTaskList.innerHTML = pkg.clerkTasks
    .map((task) => `<li class="document-row">${task}</li>`)
    .join("");
}

function renderStages(run) {
  elements.stageList.classList.remove("empty-state");
  elements.stageList.innerHTML = run.stages
    .map(
      (stage) => `
        <article class="stage-card">
          <h5>${stage.name.replaceAll("_", " ")}</h5>
          <div class="stage-meta">
            <span>Model ${stage.model}</span>
            <span>${stage.durationMs} ms</span>
            <span>Response ${stage.responseId}</span>
          </div>
          <p class="stage-output">${stage.summary}</p>
        </article>
      `,
    )
    .join("");
  elements.artifactPreview.textContent = JSON.stringify(run, null, 2);
}

function renderRuntime(run) {
  elements.runtimeStatus.textContent = "Completed";
  elements.runtimeMeta.textContent = `Finished ${formatDateTime(run.completedAt)} UTC in ${(
    run.durationMs / 1000
  ).toFixed(1)}s.`;
  elements.runtimeRunId.textContent = run.runId;
  elements.artifactLink.href = run.artifacts.latestRelativePath;
  elements.artifactLink.textContent = run.artifacts.latestRelativePath.replace("./", "");
}

function renderRun(run, sourceLabel) {
  state.run = run;
  const showcase = run.showcase;
  elements.fixtureStatus.textContent = `${sourceLabel} loaded for ${showcase.client.name} (${showcase.client.period}).`;
  elements.clientName.textContent = showcase.client.name;
  elements.clientPeriod.textContent = `${showcase.client.period} • ${showcase.client.kanzleiContact}`;
  elements.operatorNote.textContent = showcase.summary.operatorNote;
  elements.completenessPill.textContent = showcase.summary.completeness;
  elements.completenessPill.className =
    showcase.summary.completeness === "Ready for review" ? "pill good" : "pill warn";

  renderMetrics(showcase.summary);
  renderBundle(showcase.bundle);
  renderCoverage(showcase.coverage);
  renderTransactions(showcase.transactions);
  renderDocuments(showcase.extractions);
  renderException(showcase.exception);
  renderTotals(showcase.totals);
  renderPackage(showcase.package);
  renderRuntime(run);
  renderStages(run);
}

async function loadLatestRun() {
  const response = await fetch("/api/demo/latest", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No saved runtime artifact is available yet.");
  }

  const run = await response.json();
  renderRun(run, "Latest runtime artifact");
}

async function runLiveDemo() {
  setRunState(true, "Running the live source bundle through the intake, bookkeeping, and closing agents...");
  try {
    const response = await fetch("/api/demo/run", {
      method: "POST",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Live run failed.");
    }
    renderRun(payload, "Live runtime output");
  } catch (error) {
    elements.fixtureStatus.textContent = error.message;
    elements.runtimeStatus.textContent = "Failed";
    elements.runtimeMeta.textContent = "The last live run did not complete.";
  } finally {
    setRunState(false);
  }
}

elements.runDemoButton.addEventListener("click", () => {
  runLiveDemo();
});
elements.loadLatestButton.addEventListener("click", () => {
  setRunState(true, "Loading the latest persisted runtime artifact...");
  loadLatestRun()
    .catch((error) => {
      elements.fixtureStatus.textContent = error.message;
    })
    .finally(() => {
      setRunState(false);
    });
});
window.addEventListener("hashchange", setActiveRoute);

if (!window.location.hash) {
  window.location.hash = "#/intake";
}

setActiveRoute();
loadLatestRun().catch(() => {});
