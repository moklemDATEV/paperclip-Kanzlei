const state = {
  chartType: "SKR03",
  changelogLimit: 50,
  health: null,
  meta: { supportedCharts: [], purposeKeys: [], mandanten: [] },
  mandanten: [],
  accounts: [],
  buchungen: [],
  buchungLines: [],
  changelog: [],
  documents: [],
  filters: {
    mandantId: "",
    buchungId: "",
  },
};

const elements = {
  chartType: document.querySelector("#chart-type"),
  refreshButton: document.querySelector("#refresh-button"),
  healthStatus: document.querySelector("#health-status"),
  flashMessage: document.querySelector("#flash-message"),
  bookingMandantFilter: document.querySelector("#booking-mandant-filter"),
  lineBookingFilter: document.querySelector("#line-booking-filter"),
  changelogLimit: document.querySelector("#changelog-limit"),
  mandantenTable: document.querySelector("#mandanten-table"),
  accountsTable: document.querySelector("#accounts-table"),
  bookingsTable: document.querySelector("#bookings-table"),
  linesTable: document.querySelector("#lines-table"),
  changelogTable: document.querySelector("#changelog-table"),
  documentsTable: document.querySelector("#documents-table"),
  mandantForm: document.querySelector("#mandant-form"),
  accountForm: document.querySelector("#account-form"),
  bookingForm: document.querySelector("#booking-form"),
  lineForm: document.querySelector("#line-form"),
  documentForm: document.querySelector("#document-form"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(Number(amount || 0));
}

function formatTimestamp(value) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function apiPath(path) {
  return path.startsWith("api/") ? path : `api/${path.replace(/^\/+/, "")}`;
}

function setFlash(message, isError = false) {
  elements.flashMessage.textContent = message;
  elements.flashMessage.style.color = isError ? "#a54822" : "#0c5145";
}

function resetForm(form) {
  form.classList.add("hidden");
  form.innerHTML = "";
}

function formatOptionalDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function revealForm(form) {
  form.classList.remove("hidden");
  const focusTarget = form.querySelector("input, select, textarea");
  if (focusTarget) {
    focusTarget.focus({ preventScroll: true });
  }
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderChartControls() {
  elements.chartType.innerHTML = state.meta.supportedCharts
    .map(
      (chartType) =>
        `<option value="${chartType}" ${chartType === state.chartType ? "selected" : ""}>${chartType}</option>`,
    )
    .join("");
}

function renderFilterControls() {
  const mandantOptions = [
    '<option value="">All mandanten</option>',
    ...state.mandanten.map(
      (mandant) =>
        `<option value="${mandant.id}" ${mandant.id === state.filters.mandantId ? "selected" : ""}>${escapeHtml(mandant.displayName)}</option>`,
    ),
  ];
  elements.bookingMandantFilter.innerHTML = mandantOptions.join("");

  const bookingOptions = [
    '<option value="">All bookings</option>',
    ...state.buchungen.map(
      (booking) =>
        `<option value="${booking.id}" ${booking.id === state.filters.buchungId ? "selected" : ""}>${escapeHtml(booking.postingDate)} · ${escapeHtml(booking.counterparty)}</option>`,
    ),
  ];
  elements.lineBookingFilter.innerHTML = bookingOptions.join("");
}

function renderHealth() {
  if (!state.health) {
    elements.healthStatus.textContent = "Unavailable";
    return;
  }
  elements.healthStatus.innerHTML = `
    ${escapeHtml(state.health.status)} ·
    ${state.health.mandanten} mandanten ·
    ${state.health.buchungen} buchungen ·
    ${state.health.lines} lines ·
    ${state.health.changelogEntries} changelog rows
  `;
}

function renderMandantenTable() {
  elements.mandantenTable.innerHTML = state.mandanten
    .map(
      (mandant) => `
        <tr>
          <td class="mono">${escapeHtml(mandant.id)}</td>
          <td>
            <strong>${escapeHtml(mandant.displayName)}</strong>
            <div class="muted">${escapeHtml(mandant.legalName)}</div>
          </td>
          <td>${escapeHtml(mandant.legalEntity)}</td>
          <td>${mandant.bookingCount}</td>
          <td>
            <button class="secondary" type="button" data-action="edit-mandant" data-id="${mandant.id}">Edit</button>
            <button class="danger" type="button" data-action="delete-mandant" data-id="${mandant.id}">Delete</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderAccountsTable() {
  elements.accountsTable.innerHTML = state.accounts
    .map(
      (account) => `
        <tr>
          <td class="mono">${escapeHtml(account.accountCode)}</td>
          <td>${escapeHtml(account.purposeKey)}</td>
          <td>
            <strong>${escapeHtml(account.accountName)}</strong>
            <div class="muted">${escapeHtml(account.chartType)} · ${escapeHtml(account.isActive ? "active" : "inactive")}</div>
          </td>
          <td>${escapeHtml(account.category)}</td>
          <td>
            <button class="secondary" type="button" data-action="edit-account" data-id="${account.id}">Edit</button>
            <button class="danger" type="button" data-action="delete-account" data-id="${account.id}">Delete</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderBookingsTable() {
  elements.bookingsTable.innerHTML = state.buchungen
    .map(
      (booking) => `
        <tr>
          <td>${escapeHtml(booking.postingDate)}</td>
          <td>
            <strong>${escapeHtml(booking.counterparty)}</strong>
            <div class="muted mono">${escapeHtml(booking.id)}</div>
          </td>
          <td>${escapeHtml(booking.status)}</td>
          <td>${formatCurrency(booking.grossAmountEur)}</td>
          <td>${escapeHtml(booking.annotation || "—")}</td>
          <td>
            <button class="secondary" type="button" data-booking-edit-id="${booking.id}">Edit</button>
            <button class="danger" type="button" data-booking-delete-id="${booking.id}">Delete</button>
          </td>
        </tr>
      `,
    )
    .join("");

  elements.bookingsTable
    .querySelectorAll("[data-booking-edit-id]")
    .forEach((button) =>
      button.addEventListener("click", () => {
        const booking = state.buchungen.find((item) => item.id === button.dataset.bookingEditId);
        if (booking) {
          renderBookingForm(booking);
        }
      }),
    );

  elements.bookingsTable
    .querySelectorAll("[data-booking-delete-id]")
    .forEach((button) =>
      button.addEventListener("click", async () => {
        const booking = state.buchungen.find((item) => item.id === button.dataset.bookingDeleteId);
        const label = booking
          ? `${booking.postingDate} · ${booking.counterparty}`
          : "this booking";
        if (!window.confirm(`Delete ${label}?`)) {
          return;
        }
        try {
          await handleDelete("booking", button.dataset.bookingDeleteId);
        } catch (error) {
          setFlash(error.message, true);
        }
      }),
    );
}

function renderLinesTable() {
  elements.linesTable.innerHTML = state.buchungLines
    .map(
      (line) => `
        <tr>
          <td>
            <strong>${escapeHtml(line.counterparty)}</strong>
            <div class="muted mono">${escapeHtml(line.buchungId)}</div>
          </td>
          <td>${line.lineIndex}</td>
          <td>${escapeHtml(line.purposeKey)}</td>
          <td>${escapeHtml(line.entryDirection)}</td>
          <td>${formatCurrency(line.amountEur)}</td>
          <td>
            <button class="secondary" type="button" data-action="edit-line" data-id="${line.id}">Edit</button>
            <button class="danger" type="button" data-action="delete-line" data-id="${line.id}">Delete</button>
          </td>
        </tr>
      `,
    )
    .join("");
}

function renderChangelogTable() {
  elements.changelogTable.innerHTML = state.changelog
    .map(
      (entry) => `
        <tr>
          <td>${formatTimestamp(entry.changedAt)}</td>
          <td class="mono">${escapeHtml(entry.buchungLineId ? `line:${entry.buchungLineId}` : entry.buchungId || "—")}</td>
          <td>${escapeHtml(entry.fieldName)}</td>
          <td class="mono">${escapeHtml(entry.oldValue || "—")}</td>
          <td class="mono">${escapeHtml(entry.newValue || "—")}</td>
          <td>${escapeHtml(entry.changeReason || entry.changedBy || "—")}</td>
        </tr>
      `,
    )
    .join("");
}

function renderDocumentsTable() {
  if (!elements.documentsTable) {
    return;
  }
  if (state.documents.length === 0) {
    elements.documentsTable.innerHTML = `
      <tr>
        <td colspan="7" class="muted">No documents recorded.</td>
      </tr>
    `;
    return;
  }

  elements.documentsTable.innerHTML = state.documents
    .map((document) => {
      const fileLink = apiPath(`data/documents/${document.id}/file`);
      return `
        <tr>
          <td class="mono">${escapeHtml(document.mandantId)}</td>
          <td>
            <strong>${escapeHtml(document.fileName || "—")}</strong>
            <div class="muted mono">${escapeHtml(document.telegramMessageId || "—")}</div>
          </td>
          <td>${escapeHtml(document.documentType || "—")}</td>
          <td>${formatTimestamp(document.createdAt)}</td>
          <td>${escapeHtml(document.status || "—")}</td>
          <td>${document.linkedBookingId ? `<span class="mono">${escapeHtml(document.linkedBookingId)}</span>` : "—"}</td>
          <td>
            <a class="secondary" href="${fileLink}" target="_blank" rel="noopener noreferrer">View file</a>
            <button class="secondary" type="button" data-action="edit-document" data-id="${document.id}">Edit</button>
            <button class="danger" type="button" data-action="delete-document" data-id="${document.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderDocumentForm(record) {
  const linkedBookingOptions = [
    '<option value="">No linked booking</option>',
    ...state.buchungen.map(
      (booking) =>
        `<option value="${booking.id}" ${record?.linkedBookingId === booking.id ? "selected" : ""}>${escapeHtml(booking.postingDate)} · ${escapeHtml(booking.counterparty)}</option>`,
    ),
  ].join("");

  elements.documentForm.classList.remove("hidden");
  elements.documentForm.innerHTML = `
    <label>File name <input name="fileName" value="${escapeHtml(record?.fileName || "")}" required /></label>
    <label>MIME type <input name="mimeType" value="${escapeHtml(record?.mimeType || "")}" required /></label>
    <label>Document type
      <select name="documentType">
        <option value="supplier_invoice" ${record?.documentType === "supplier_invoice" ? "selected" : ""}>supplier_invoice</option>
        <option value="customer_invoice" ${record?.documentType === "customer_invoice" ? "selected" : ""}>customer_invoice</option>
        <option value="receipt" ${record?.documentType === "receipt" ? "selected" : ""}>receipt</option>
        <option value="contract" ${record?.documentType === "contract" ? "selected" : ""}>contract</option>
      </select>
    </label>
    <label>Direction
      <select name="direction">
        <option value="expense" ${record?.direction === "expense" ? "selected" : ""}>expense</option>
        <option value="revenue" ${record?.direction === "revenue" ? "selected" : ""}>revenue</option>
        <option value="agreement" ${record?.direction === "agreement" ? "selected" : ""}>agreement</option>
      </select>
    </label>
    <label>Counterparty <input name="counterparty" value="${escapeHtml(record?.counterparty || "")}" required /></label>
    <label>Date <input name="documentDate" type="date" value="${escapeHtml(formatOptionalDate(record?.documentDate))}" /></label>
    <label>Status
      <select name="status">
        <option value="ready" ${record?.status === "ready" ? "selected" : ""}>ready</option>
        <option value="needs_review" ${record?.status === "needs_review" ? "selected" : ""}>needs_review</option>
        <option value="reference_only" ${record?.status === "reference_only" ? "selected" : ""}>reference_only</option>
      </select>
    </label>
    <label>Confidence <input name="confidence" value="${escapeHtml(record?.confidence || "")}" required /></label>
    <label>Currency <input name="currency" value="${escapeHtml(record?.currency || "EUR")}" required /></label>
    <label>VAT rate <input name="vatRate" type="number" step="0.01" value="${escapeHtml(record?.vatRate ?? 0)}" /></label>
    <label>Gross EUR <input name="grossAmountEur" type="number" step="0.01" value="${escapeHtml(record?.grossAmountEur ?? "")}" /></label>
    <label>Net EUR <input name="netAmountEur" type="number" step="0.01" value="${escapeHtml(record?.netAmountEur ?? "")}" /></label>
    <label>VAT EUR <input name="vatAmountEur" type="number" step="0.01" value="${escapeHtml(record?.vatAmountEur ?? "")}" /></label>
    <label>Purpose key <input name="purposeKey" value="${escapeHtml(record?.purposeKey || "")}" /></label>
    <label>Linked booking
      <select name="linkedBookingId">${linkedBookingOptions}</select>
    </label>
    <label class="full">Description <input name="description" value="${escapeHtml(record?.description || "")}" required /></label>
    <label class="full">Source link <input name="sourceLink" value="${escapeHtml(record?.sourceLink || "")}" /></label>
    <div class="editor-actions">
      <button class="secondary" type="button" data-action="cancel-form" data-form="document">Cancel</button>
      <button type="submit">Update document</button>
    </div>
  `;
  elements.documentForm.onsubmit = (event) => submitDocumentForm(event, record.id);
  revealForm(elements.documentForm);
}

function renderMandantForm(record = null) {
  elements.mandantForm.classList.remove("hidden");
  elements.mandantForm.innerHTML = `
    <label>ID <input name="id" value="${escapeHtml(record?.id || "")}" ${record ? "readonly" : ""} required /></label>
    <label>Legal name <input name="legalName" value="${escapeHtml(record?.legalName || "")}" required /></label>
    <label>Display name <input name="displayName" value="${escapeHtml(record?.displayName || "")}" required /></label>
    <label>VAT ID <input name="vatId" value="${escapeHtml(record?.vatId || "")}" /></label>
    <label>Legal entity <input name="legalEntity" value="${escapeHtml(record?.legalEntity || "")}" required /></label>
    <label>Industry <input name="industry" value="${escapeHtml(record?.industry || "")}" /></label>
    <label>Accounting basis <input name="accountingBasis" value="${escapeHtml(record?.accountingBasis || "")}" /></label>
    <label>Bank name <input name="bankName" value="${escapeHtml(record?.bankName || "")}" /></label>
    <div class="editor-actions">
      <button class="secondary" type="button" data-action="cancel-form" data-form="mandant">Cancel</button>
      <button type="submit">${record ? "Update mandant" : "Create mandant"}</button>
    </div>
  `;
  elements.mandantForm.onsubmit = (event) => submitMandantForm(event, Boolean(record));
}

function renderAccountForm(record = null) {
  elements.accountForm.classList.remove("hidden");
  elements.accountForm.innerHTML = `
    <label>Chart type
      <select name="chartType">${state.meta.supportedCharts
        .map(
          (chartType) =>
            `<option value="${chartType}" ${(record?.chartType || state.chartType) === chartType ? "selected" : ""}>${chartType}</option>`,
        )
        .join("")}</select>
    </label>
    <label>Purpose key <input name="purposeKey" value="${escapeHtml(record?.purposeKey || "")}" required /></label>
    <label>Account code <input name="accountCode" value="${escapeHtml(record?.accountCode || "")}" required /></label>
    <label>Account name <input name="accountName" value="${escapeHtml(record?.accountName || "")}" required /></label>
    <label>Category <input name="category" value="${escapeHtml(record?.category || "")}" required /></label>
    <label>Tax rate <input name="taxRate" type="number" step="0.01" value="${escapeHtml(record?.taxRate ?? 0)}" /></label>
    <label>Is active
      <select name="isActive">
        <option value="true" ${record?.isActive !== false ? "selected" : ""}>true</option>
        <option value="false" ${record?.isActive === false ? "selected" : ""}>false</option>
      </select>
    </label>
    <div class="editor-actions">
      <button class="secondary" type="button" data-action="cancel-form" data-form="account">Cancel</button>
      <button type="submit">${record ? "Update account" : "Create account"}</button>
    </div>
  `;
  elements.accountForm.onsubmit = (event) => submitAccountForm(event, record?.id || null);
}

function renderBookingForm(record = null) {
  const mandantOptions = state.mandanten
    .map(
      (mandant) =>
        `<option value="${mandant.id}" ${(record?.mandantId || state.filters.mandantId || "") === mandant.id ? "selected" : ""}>${escapeHtml(mandant.displayName)}</option>`,
    )
    .join("");
  const defaultLines = JSON.stringify(
    [
      { lineIndex: 1, purposeKey: "BANK", entryDirection: "debit", amountEur: 119, taxRate: 0, memo: "Bank entry" },
      { lineIndex: 2, purposeKey: state.meta.purposeKeys.find((item) => item !== "BANK") || "REVENUE_19", entryDirection: "credit", amountEur: 119, taxRate: 19, memo: "Offset entry" },
    ],
    null,
    2,
  );
  elements.bookingForm.classList.remove("hidden");
  elements.bookingForm.innerHTML = `
    <label>Mandant
      <select name="mandantId" required>${mandantOptions}</select>
    </label>
    <label>Source type <input name="sourceType" value="${escapeHtml(record?.sourceType || "manual_ui")}" required /></label>
    <label>Source reference <input name="sourceReference" value="${escapeHtml(record?.sourceReference || "ui-entry")}" required /></label>
    <label>Posting date <input name="postingDate" type="date" value="${escapeHtml(record?.postingDate || "")}" required /></label>
    <label>Counterparty <input name="counterparty" value="${escapeHtml(record?.counterparty || "")}" required /></label>
    <label>Status
      <select name="status">
        <option value="ready" ${record?.status !== "needs_review" ? "selected" : ""}>ready</option>
        <option value="needs_review" ${record?.status === "needs_review" ? "selected" : ""}>needs_review</option>
      </select>
    </label>
    <label>Description <input name="description" value="${escapeHtml(record?.description || "")}" required /></label>
    <label>Gross EUR <input name="grossAmountEur" type="number" step="0.01" value="${escapeHtml(record?.grossAmountEur || "")}" required /></label>
    <label>Net EUR <input name="netAmountEur" type="number" step="0.01" value="${escapeHtml(record?.netAmountEur || "")}" required /></label>
    <label>VAT EUR <input name="vatAmountEur" type="number" step="0.01" value="${escapeHtml(record?.vatAmountEur || "")}" required /></label>
    <label>Currency <input name="currency" value="${escapeHtml(record?.currency || "EUR")}" required /></label>
    <label class="full">Annotation <input name="annotation" value="${escapeHtml(record?.annotation || "")}" /></label>
    ${
      record
        ? `
          <label>Changed by <input name="changedBy" value="steuerberater-db-ui" required /></label>
          <label class="full">Change reason <input name="changeReason" value="" placeholder="Why was this booking changed?" /></label>
        `
        : `
          <label class="full">Initial lines JSON
            <textarea name="linesJson" required>${escapeHtml(defaultLines)}</textarea>
          </label>
        `
    }
    <div class="editor-actions">
      <button class="secondary" type="button" data-action="cancel-form" data-form="booking">Cancel</button>
      <button type="submit">${record ? "Update booking" : "Create booking"}</button>
    </div>
  `;
  elements.bookingForm.onsubmit = (event) => submitBookingForm(event, record?.id || null);
  revealForm(elements.bookingForm);
}

function renderLineForm(record = null) {
  const bookingOptions = state.buchungen
    .map(
      (booking) =>
        `<option value="${booking.id}" ${(record?.buchungId || state.filters.buchungId || "") === booking.id ? "selected" : ""}>${escapeHtml(booking.postingDate)} · ${escapeHtml(booking.counterparty)}</option>`,
    )
    .join("");
  const purposeOptions = state.meta.purposeKeys
    .map(
      (purposeKey) =>
        `<option value="${purposeKey}" ${(record?.purposeKey || "") === purposeKey ? "selected" : ""}>${escapeHtml(purposeKey)}</option>`,
    )
    .join("");
  elements.lineForm.classList.remove("hidden");
  elements.lineForm.innerHTML = `
    <label>Booking
      <select name="buchungId" ${record ? "disabled" : "required"}>${bookingOptions}</select>
    </label>
    <label>Line index <input name="lineIndex" type="number" value="${escapeHtml(record?.lineIndex || 1)}" required /></label>
    <label>Purpose key
      <select name="purposeKey">${purposeOptions}</select>
    </label>
    <label>Direction
      <select name="entryDirection">
        <option value="debit" ${record?.entryDirection !== "credit" ? "selected" : ""}>debit</option>
        <option value="credit" ${record?.entryDirection === "credit" ? "selected" : ""}>credit</option>
      </select>
    </label>
    <label>Amount EUR <input name="amountEur" type="number" step="0.01" value="${escapeHtml(record?.amountEur || "")}" required /></label>
    <label>Tax rate <input name="taxRate" type="number" step="0.01" value="${escapeHtml(record?.taxRate ?? 0)}" /></label>
    <label>Memo <input name="memo" value="${escapeHtml(record?.memo || "")}" /></label>
    <label>Annotation <input name="annotation" value="${escapeHtml(record?.annotation || "")}" /></label>
    ${
      record
        ? `
          <label>Changed by <input name="changedBy" value="steuerberater-db-ui" required /></label>
          <label class="full">Change reason <input name="changeReason" value="" placeholder="Why was this line changed?" /></label>
        `
        : ""
    }
    <div class="editor-actions">
      <button class="secondary" type="button" data-action="cancel-form" data-form="line">Cancel</button>
      <button type="submit">${record ? "Update line" : "Create line"}</button>
    </div>
  `;
  elements.lineForm.onsubmit = (event) => submitLineForm(event, record?.id || null, record?.buchungId || null);
}

async function submitMandantForm(event, isEdit) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  const path = isEdit
    ? apiPath(`steuerberater/mandanten/${encodeURIComponent(payload.id)}`)
    : apiPath("steuerberater/mandanten");
  await api(path, {
    method: isEdit ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  resetForm(elements.mandantForm);
  setFlash(`Mandant ${isEdit ? "updated" : "created"}.`);
  await loadData();
}

async function submitAccountForm(event, id) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api(id ? apiPath(`steuerberater/account-catalog/${id}`) : apiPath("steuerberater/account-catalog"), {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  resetForm(elements.accountForm);
  setFlash(`Account ${id ? "updated" : "created"}.`);
  await loadData();
}

async function submitBookingForm(event, id) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (!id) {
    payload.lines = JSON.parse(payload.linesJson);
    delete payload.linesJson;
  }
  await api(id ? apiPath(`steuerberater/buchungen/${id}?chartType=${state.chartType}`) : apiPath("steuerberater/buchungen"), {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  resetForm(elements.bookingForm);
  setFlash(`Booking ${id ? "updated" : "created"}.`);
  await loadData();
}

async function submitLineForm(event, id, fixedBookingId) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  if (fixedBookingId) {
    payload.buchungId = fixedBookingId;
  }
  await api(id ? apiPath(`steuerberater/buchung-lines/${id}?chartType=${state.chartType}`) : apiPath("steuerberater/buchung-lines"), {
    method: id ? "PUT" : "POST",
    body: JSON.stringify(payload),
  });
  resetForm(elements.lineForm);
  setFlash(`Line ${id ? "updated" : "created"}.`);
  await loadData();
}

async function submitDocumentForm(event, id) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api(apiPath(`data/documents/${id}`), {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  resetForm(elements.documentForm);
  setFlash("Document updated.");
  await loadData();
}

async function loadData() {
  setFlash("Loading database state...");
  const query = state.filters.mandantId
    ? `?chartType=${state.chartType}&mandantId=${encodeURIComponent(state.filters.mandantId)}`
    : `?chartType=${state.chartType}`;
  const lineQuery = state.filters.buchungId
    ? `?chartType=${state.chartType}&buchungId=${encodeURIComponent(state.filters.buchungId)}`
    : `?chartType=${state.chartType}`;
  const changelogQuery = `?limit=${state.changelogLimit}`;

  const [
    health,
    meta,
    mandantenPayload,
    accountsPayload,
    bookingsPayload,
    linesPayload,
    changelogPayload,
    documentsPayload,
  ] = await Promise.all([
      api(apiPath("steuerberater/health")),
      api(apiPath(`steuerberater/meta?chartType=${state.chartType}`)),
      api(apiPath("steuerberater/mandanten")),
      api(apiPath(`steuerberater/account-catalog?chartType=${state.chartType}`)),
      api(apiPath(`steuerberater/buchungen${query}`)),
      api(apiPath(`steuerberater/buchung-lines${lineQuery}`)),
      api(apiPath(`steuerberater/changelog${changelogQuery}`)),
      api(apiPath("data/documents")),
    ]);

  state.health = health;
  state.meta = meta;
  state.mandanten = mandantenPayload.mandanten;
  state.accounts = accountsPayload.accounts;
  state.buchungen = bookingsPayload.buchungen;
  state.buchungLines = linesPayload.buchungLines;
  state.changelog = changelogPayload.entries;
  state.documents = documentsPayload.documents;

  renderChartControls();
  renderFilterControls();
  renderHealth();
  renderMandantenTable();
  renderAccountsTable();
  renderBookingsTable();
  renderLinesTable();
  renderChangelogTable();
  renderDocumentsTable();
  setFlash("Database state refreshed.");
}

async function handleDelete(kind, id) {
  const pathMap = {
    mandant: apiPath(`steuerberater/mandanten/${encodeURIComponent(id)}`),
    account: apiPath(`steuerberater/account-catalog/${id}`),
    booking: apiPath(`steuerberater/buchungen/${encodeURIComponent(id)}`),
    line: apiPath(`steuerberater/buchung-lines/${id}`),
    document: apiPath(`data/documents/${encodeURIComponent(id)}?deleteStoredFile=true`),
  };
  await api(pathMap[kind], { method: "DELETE" });
  setFlash(`${kind} deleted.`);
  await loadData();
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    return;
  }

  const action = target.dataset.action;

  try {
    if (action === "new-mandant") {
      renderMandantForm();
      return;
    }
    if (action === "new-account") {
      renderAccountForm();
      return;
    }
    if (action === "new-booking") {
      renderBookingForm();
      return;
    }
    if (action === "new-line") {
      renderLineForm();
      return;
    }
    if (action === "cancel-form") {
      resetForm(elements[`${target.dataset.form}Form`]);
      return;
    }
    if (action === "edit-mandant") {
      renderMandantForm(state.mandanten.find((item) => item.id === target.dataset.id));
      return;
    }
    if (action === "edit-account") {
      renderAccountForm(state.accounts.find((item) => String(item.id) === target.dataset.id));
      return;
    }
    if (action === "edit-booking") {
      renderBookingForm(state.buchungen.find((item) => item.id === target.dataset.id));
      return;
    }
    if (action === "edit-line") {
      renderLineForm(state.buchungLines.find((item) => String(item.id) === target.dataset.id));
      return;
    }
    if (action === "edit-document") {
      renderDocumentForm(state.documents.find((item) => item.id === target.dataset.id));
      return;
    }
    if (action.startsWith("delete-")) {
      const kind = action.replace("delete-", "");
      if (window.confirm(`Delete this ${kind}?`)) {
        await handleDelete(kind, target.dataset.id);
      }
    }
  } catch (error) {
    setFlash(error.message, true);
  }
});

elements.refreshButton.addEventListener("click", () => {
  loadData().catch((error) => setFlash(error.message, true));
});

elements.chartType.addEventListener("change", (event) => {
  state.chartType = event.target.value;
  loadData().catch((error) => setFlash(error.message, true));
});

elements.bookingMandantFilter.addEventListener("change", (event) => {
  state.filters.mandantId = event.target.value;
  loadData().catch((error) => setFlash(error.message, true));
});

elements.lineBookingFilter.addEventListener("change", (event) => {
  state.filters.buchungId = event.target.value;
  loadData().catch((error) => setFlash(error.message, true));
});

elements.changelogLimit.addEventListener("change", (event) => {
  state.changelogLimit = Number(event.target.value);
  loadData().catch((error) => setFlash(error.message, true));
});

loadData().catch((error) => setFlash(error.message, true));
