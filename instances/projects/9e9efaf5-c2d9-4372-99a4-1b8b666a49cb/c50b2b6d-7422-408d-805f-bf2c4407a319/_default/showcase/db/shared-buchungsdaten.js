const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const initSqlJs = require("sql.js");

const ROOT_DIR = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");
const DEFAULT_DB_PATH = path.join(RUNTIME_DIR, "shared-buchungsdaten.sqlite");

const SUPPORTED_CHART_TYPES = ["SKR03", "SKR04"];

const MANDANT_ID = "berg-und-tal-eventtechnik-gmbh";
const CLIENT_CONTEXT = {
  id: MANDANT_ID,
  legalName: "Berg & Tal Eventtechnik GmbH",
  displayName: "Berg & Tal Eventtechnik GmbH",
  vatId: "DE342198765",
  legalEntity: "GmbH",
  industry: "Event equipment rental",
  accountingBasis: "Standard monthly bookkeeping with DATEV export",
  bankName: "Sparkasse KoelnBonn business account",
};

const ACCOUNT_CATALOG = [
  {
    purposeKey: "BANK",
    category: "asset",
    taxRate: 0,
    labels: {
      SKR03: { code: "1200", name: "Bank" },
      SKR04: { code: "1800", name: "Bank" },
    },
  },
  {
    purposeKey: "CASH",
    category: "asset",
    taxRate: 0,
    labels: {
      SKR03: { code: "1000", name: "Kasse" },
      SKR04: { code: "1000", name: "Kasse" },
    },
  },
  {
    purposeKey: "TRADE_RECEIVABLES",
    category: "asset",
    taxRate: 0,
    labels: {
      SKR03: { code: "1400", name: "Forderungen aus Lieferungen und Leistungen" },
      SKR04: { code: "1200", name: "Forderungen aus Lieferungen und Leistungen" },
    },
  },
  {
    purposeKey: "TRADE_PAYABLES",
    category: "liability",
    taxRate: 0,
    labels: {
      SKR03: { code: "1600", name: "Verbindlichkeiten aus Lieferungen und Leistungen" },
      SKR04: { code: "3300", name: "Verbindlichkeiten aus Lieferungen und Leistungen" },
    },
  },
  {
    purposeKey: "REVENUE_19",
    category: "revenue",
    taxRate: 19,
    labels: {
      SKR03: { code: "8400", name: "Erlöse 19% USt" },
      SKR04: { code: "4400", name: "Erlöse 19% USt" },
    },
  },
  {
    purposeKey: "OUTPUT_VAT_19",
    category: "liability",
    taxRate: 19,
    labels: {
      SKR03: { code: "1776", name: "Umsatzsteuer 19%" },
      SKR04: { code: "3806", name: "Umsatzsteuer 19%" },
    },
  },
  {
    purposeKey: "INPUT_VAT_19",
    category: "asset",
    taxRate: 19,
    labels: {
      SKR03: { code: "1576", name: "Vorsteuer 19%" },
      SKR04: { code: "1406", name: "Vorsteuer 19%" },
    },
  },
  {
    purposeKey: "UTILITIES",
    category: "expense",
    taxRate: 19,
    labels: {
      SKR03: { code: "4250", name: "Strom, Gas und sonstige Energie" },
      SKR04: { code: "6345", name: "Strom, Gas und sonstige Energie" },
    },
  },
  {
    purposeKey: "OFFICE_SUPPLIES",
    category: "expense",
    taxRate: 19,
    labels: {
      SKR03: { code: "4930", name: "Buerobedarf" },
      SKR04: { code: "6815", name: "Buerobedarf" },
    },
  },
  {
    purposeKey: "TELECOM",
    category: "expense",
    taxRate: 19,
    labels: {
      SKR03: { code: "4925", name: "Telefon" },
      SKR04: { code: "6805", name: "Telefon" },
    },
  },
  {
    purposeKey: "VEHICLE_RENTAL",
    category: "expense",
    taxRate: 19,
    labels: {
      SKR03: { code: "4580", name: "Mietfahrzeuge" },
      SKR04: { code: "6670", name: "Mietfahrzeuge" },
    },
  },
  {
    purposeKey: "TEAM_EVENT_REVIEW",
    category: "expense_review",
    taxRate: 19,
    labels: {
      SKR03: { code: "4650", name: "Bewirtungskosten" },
      SKR04: { code: "6640", name: "Bewirtungskosten" },
    },
  },
  {
    purposeKey: "OWNER_CONTRIBUTION",
    category: "equity",
    taxRate: 0,
    labels: {
      SKR03: { code: "1890", name: "Privateinlagen" },
      SKR04: { code: "2180", name: "Privateinlagen" },
    },
  },
];

const SCHEMA_SQL = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS mandanten (
    id TEXT PRIMARY KEY,
    legal_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    vat_id TEXT,
    legal_entity TEXT NOT NULL,
    industry TEXT,
    accounting_basis TEXT,
    bank_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chart_type TEXT NOT NULL CHECK (chart_type IN ('SKR03', 'SKR04')),
    purpose_key TEXT NOT NULL,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_category TEXT NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (chart_type, purpose_key),
    UNIQUE (chart_type, account_code)
  );

  CREATE TABLE IF NOT EXISTS buchungen (
    id TEXT PRIMARY KEY,
    mandant_id TEXT NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_reference TEXT NOT NULL,
    posting_date TEXT NOT NULL,
    counterparty TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ready', 'needs_review')),
    gross_amount_eur REAL NOT NULL,
    net_amount_eur REAL NOT NULL,
    vat_amount_eur REAL NOT NULL,
    annotation TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_buchungen_mandant_date
    ON buchungen (mandant_id, posting_date);

  CREATE TABLE IF NOT EXISTS buchung_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buchung_id TEXT NOT NULL REFERENCES buchungen(id) ON DELETE CASCADE,
    line_index INTEGER NOT NULL,
    purpose_key TEXT NOT NULL,
    entry_direction TEXT NOT NULL CHECK (entry_direction IN ('debit', 'credit')),
    amount_eur REAL NOT NULL,
    tax_rate REAL NOT NULL DEFAULT 0,
    memo TEXT,
    annotation TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (buchung_id, line_index)
  );

  CREATE TABLE IF NOT EXISTS buchungen_changelog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buchung_id TEXT,
    buchung_line_id INTEGER,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    change_reason TEXT,
    FOREIGN KEY (buchung_id) REFERENCES buchungen(id) ON DELETE CASCADE,
    FOREIGN KEY (buchung_line_id) REFERENCES buchung_lines(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS telegram_submissions (
    id TEXT PRIMARY KEY,
    mandant_id TEXT NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    source_label TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_submissions_mandant
    ON telegram_submissions (mandant_id, submitted_at DESC);

  CREATE TABLE IF NOT EXISTS telegram_documents (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES telegram_submissions(id) ON DELETE CASCADE,
    mandant_id TEXT NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
    telegram_message_id TEXT,
    telegram_file_id TEXT,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('supplier_invoice', 'customer_invoice', 'receipt', 'contract')),
    direction TEXT NOT NULL CHECK (direction IN ('expense', 'revenue', 'agreement')),
    counterparty TEXT NOT NULL,
    document_date TEXT,
    service_period_start TEXT,
    service_period_end TEXT,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ready', 'needs_review', 'reference_only')),
    confidence TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    vat_rate REAL NOT NULL DEFAULT 0,
    gross_amount_eur REAL,
    net_amount_eur REAL,
    vat_amount_eur REAL,
    purpose_key TEXT,
    source_link TEXT,
    extracted_json TEXT NOT NULL,
    raw_payload_json TEXT NOT NULL,
    linked_booking_id TEXT REFERENCES buchungen(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_documents_mandant
    ON telegram_documents (mandant_id, document_date DESC, created_at DESC);

  CREATE TABLE IF NOT EXISTS telegram_message_tickets (
    id TEXT PRIMARY KEY,
    telegram_message_id TEXT NOT NULL UNIQUE,
    telegram_update_id TEXT,
    channel TEXT NOT NULL,
    bot_key TEXT NOT NULL,
    telegram_chat_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    sender_username TEXT,
    message_body TEXT NOT NULL,
    message_type TEXT NOT NULL,
    mandant_id TEXT REFERENCES mandanten(id) ON DELETE SET NULL,
    unmatched_mandant INTEGER NOT NULL DEFAULT 0,
    intent TEXT,
    intent_confidence REAL NOT NULL DEFAULT 0,
    route_key TEXT NOT NULL,
    route_label TEXT NOT NULL,
    downstream_path TEXT NOT NULL,
    issue_type_label TEXT NOT NULL,
    assignee_agent_id TEXT,
    assignee_agent_name TEXT NOT NULL,
    paperclip_issue_id TEXT,
    paperclip_issue_identifier TEXT,
    submission_id TEXT REFERENCES telegram_submissions(id) ON DELETE SET NULL,
    attachment_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    raw_update_json TEXT NOT NULL,
    processing_error TEXT,
    fallback_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_message_tickets_channel
    ON telegram_message_tickets (channel, created_at DESC);

  CREATE TABLE IF NOT EXISTS telegram_ticket_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL REFERENCES telegram_message_tickets(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    detail_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_telegram_ticket_audit_events_ticket
    ON telegram_ticket_audit_events (ticket_id, id ASC);

  CREATE TABLE IF NOT EXISTS telegram_outbound_approvals (
    ticket_id TEXT PRIMARY KEY REFERENCES telegram_message_tickets(id) ON DELETE CASCADE,
    compliance_passed INTEGER NOT NULL DEFAULT 0,
    compliance_passed_at TEXT,
    review_passed INTEGER NOT NULL DEFAULT 0,
    review_passed_at TEXT,
    released_at TEXT,
    outbound_bot_key TEXT,
    outbound_chat_id TEXT,
    outbound_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

let sqlJsPromise = null;

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function splitVat19(grossAmount) {
  const netAmount = roundCurrency(grossAmount / 1.19);
  return {
    netAmount,
    vatAmount: roundCurrency(grossAmount - netAmount),
    grossAmount: roundCurrency(grossAmount),
  };
}

async function getSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file) => path.join(ROOT_DIR, "..", "node_modules", "sql.js", "dist", file),
    });
  }
  return sqlJsPromise;
}

function parseCsv(text) {
  const [headerLine, ...rows] = text.trim().split("\n");
  const headers = headerLine.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    return headers.reduce((record, header, index) => {
      record[header] = values[index] || "";
      return record;
    }, {});
  });
}

async function readFixtureJson(fileName) {
  const contents = await fs.readFile(path.join(DATA_DIR, fileName), "utf8");
  return JSON.parse(contents);
}

async function readOptionalFixtureJson(fileName, fallbackValue = []) {
  try {
    return await readFixtureJson(fileName);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function loadFixtureData() {
  const [bankCsv, supplierInvoices, customerInvoices, additionalBookings] = await Promise.all([
    fs.readFile(path.join(DATA_DIR, "2026-04-bank.csv"), "utf8"),
    readFixtureJson("supplier-invoices.json"),
    readFixtureJson("customer-invoices.json"),
    readOptionalFixtureJson("ledger-seed-bookings.json"),
  ]);

  return {
    bankTransactions: parseCsv(bankCsv),
    supplierInvoices,
    customerInvoices,
    additionalBookings,
  };
}

function allRows(statement) {
  const rows = [];
  while (statement.step()) {
    rows.push(statement.getAsObject());
  }
  statement.free();
  return rows;
}

function queryAll(db, sql, params = []) {
  const statement = db.prepare(sql, params);
  return allRows(statement);
}

function queryOne(db, sql, params = []) {
  const statement = db.prepare(sql, params);
  const rows = allRows(statement);
  return rows[0] || null;
}

function hasColumn(db, tableName, columnName) {
  return queryAll(db, `PRAGMA table_info(${tableName})`).some((row) => row.name === columnName);
}

function normalizeOptionalString(value) {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    return String(value);
  }
  return value.trim() === "" ? null : value;
}

function stringifyChangelogValue(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function assertChartType(chartType) {
  if (!SUPPORTED_CHART_TYPES.includes(chartType)) {
    throw new Error(`Unsupported chart type: ${chartType}`);
  }
}

function normalizeLine(line, lineIndex) {
  if (!line || typeof line !== "object") {
    throw new Error("Each booking line must be an object.");
  }
  if (!line.purposeKey || typeof line.purposeKey !== "string") {
    throw new Error("Each booking line requires purposeKey.");
  }
  if (!["debit", "credit"].includes(line.entryDirection)) {
    throw new Error("Each booking line requires entryDirection=debit|credit.");
  }
  if (typeof line.amountEur !== "number" || !Number.isFinite(line.amountEur) || line.amountEur <= 0) {
    throw new Error("Each booking line requires a positive numeric amountEur.");
  }

  return {
    lineIndex,
    purposeKey: line.purposeKey,
    entryDirection: line.entryDirection,
    amountEur: roundCurrency(line.amountEur),
    taxRate: typeof line.taxRate === "number" ? line.taxRate : 0,
    memo: line.memo || "",
    annotation: normalizeOptionalString(line.annotation),
  };
}

function buildSeedBookings(fixtures) {
  const supplierByDocument = new Map(
    fixtures.supplierInvoices.map((invoice) => [invoice.fileName.replace(/\.json$/, ""), invoice]),
  );
  const customerByInvoice = new Map(
    fixtures.customerInvoices.map((invoice) => [invoice.invoiceNumber, invoice]),
  );

  const bankSeedBookings = fixtures.bankTransactions.map((transaction) => {
    const grossAmount = Number(transaction.gross_eur);
    const common = {
      mandantId: MANDANT_ID,
      postingDate: transaction.date,
      counterparty: transaction.counterparty,
      sourceType: "bank_fixture",
      sourceReference: transaction.matching_document,
      currency: "EUR",
    };

    if (customerByInvoice.has(transaction.matching_document)) {
      const breakdown = splitVat19(grossAmount);
      return {
        ...common,
        id: `seed-${transaction.date}-${transaction.matching_document.toLowerCase()}`,
        description: `Customer receipt ${transaction.matching_document}`,
        status: "ready",
        grossAmountEur: breakdown.grossAmount,
        netAmountEur: breakdown.netAmount,
        vatAmountEur: breakdown.vatAmount,
        lines: [
          { purposeKey: "BANK", entryDirection: "debit", amountEur: breakdown.grossAmount, memo: "Bank receipt" },
          { purposeKey: "REVENUE_19", entryDirection: "credit", amountEur: breakdown.netAmount, taxRate: 19, memo: "Revenue at 19% VAT" },
          { purposeKey: "OUTPUT_VAT_19", entryDirection: "credit", amountEur: breakdown.vatAmount, taxRate: 19, memo: "Output VAT 19%" },
        ],
      };
    }

    if (transaction.counterparty === CLIENT_CONTEXT.legalName) {
      return {
        ...common,
        id: `seed-${transaction.date}-owner-contribution`,
        description: "Owner contribution / capital injection",
        status: "ready",
        grossAmountEur: roundCurrency(grossAmount),
        netAmountEur: roundCurrency(grossAmount),
        vatAmountEur: 0,
        lines: [
          { purposeKey: "BANK", entryDirection: "debit", amountEur: grossAmount, memo: "Cash received" },
          { purposeKey: "OWNER_CONTRIBUTION", entryDirection: "credit", amountEur: grossAmount, memo: "Owner contribution" },
        ],
      };
    }

    if (supplierByDocument.has(transaction.matching_document)) {
      const supplierInvoice = supplierByDocument.get(transaction.matching_document);
      const purposeKeyMap = {
        "Amazon EU S.a r.l.": "OFFICE_SUPPLIES",
        "Telekom Deutschland GmbH": "TELECOM",
        "Van4Event GmbH": "VEHICLE_RENTAL",
        "Metro Deutschland GmbH": "TEAM_EVENT_REVIEW",
      };
      const purposeKey = purposeKeyMap[supplierInvoice.vendor];
      return {
        ...common,
        id: `seed-${transaction.date}-${transaction.matching_document.toLowerCase()}`,
        description: `${supplierInvoice.vendor} supplier invoice`,
        status: supplierInvoice.status === "needs_review" ? "needs_review" : "ready",
        grossAmountEur: roundCurrency(supplierInvoice.grossEur),
        netAmountEur: roundCurrency(supplierInvoice.netEur),
        vatAmountEur: roundCurrency(supplierInvoice.vatEur),
        lines: [
          {
            purposeKey,
            entryDirection: "debit",
            amountEur: supplierInvoice.netEur,
            taxRate: 19,
            memo: supplierInvoice.status === "needs_review" ? "Review expense classification" : "Operating expense",
          },
          { purposeKey: "INPUT_VAT_19", entryDirection: "debit", amountEur: supplierInvoice.vatEur, taxRate: 19, memo: "Input VAT 19%" },
          { purposeKey: "BANK", entryDirection: "credit", amountEur: supplierInvoice.grossEur, memo: "Bank payment" },
        ],
      };
    }

    if (transaction.counterparty === "Stadtwerke Koeln") {
      const breakdown = splitVat19(grossAmount);
      return {
        ...common,
        id: `seed-${transaction.date}-stadtwerke`,
        description: "Utilities expense from bank statement",
        status: "ready",
        grossAmountEur: breakdown.grossAmount,
        netAmountEur: breakdown.netAmount,
        vatAmountEur: breakdown.vatAmount,
        lines: [
          { purposeKey: "UTILITIES", entryDirection: "debit", amountEur: breakdown.netAmount, taxRate: 19, memo: "Utilities expense" },
          { purposeKey: "INPUT_VAT_19", entryDirection: "debit", amountEur: breakdown.vatAmount, taxRate: 19, memo: "Input VAT 19%" },
          { purposeKey: "BANK", entryDirection: "credit", amountEur: breakdown.grossAmount, memo: "Bank payment" },
        ],
      };
    }

    throw new Error(`No seed mapping defined for transaction ${transaction.date} ${transaction.counterparty}`);
  });

  return bankSeedBookings.concat(fixtures.additionalBookings || []);
}

class SharedBuchungsdatenStore {
  constructor({ SQL, db, filePath }) {
    this.SQL = SQL;
    this.db = db;
    this.filePath = filePath;
    this.lastLoadedMtimeMs = null;
  }

  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, Buffer.from(this.db.export()));
    const stat = await fs.stat(this.filePath);
    this.lastLoadedMtimeMs = stat.mtimeMs;
  }

  async refreshFromDiskIfChanged() {
    let stat;
    try {
      stat = await fs.stat(this.filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return false;
      }
      throw error;
    }

    if (this.lastLoadedMtimeMs != null && stat.mtimeMs <= this.lastLoadedMtimeMs) {
      return false;
    }

    const buffer = await fs.readFile(this.filePath);
    const nextDb = new this.SQL.Database(new Uint8Array(buffer));
    if (typeof this.db.close === "function") {
      this.db.close();
    }
    this.db = nextDb;
    this.applySchema();
    this.applyMigrations();
    this.seedAccountCatalog();
    this.lastLoadedMtimeMs = stat.mtimeMs;
    return true;
  }

  applySchema() {
    this.db.exec(SCHEMA_SQL);
  }

  applyMigrations() {
    if (!hasColumn(this.db, "buchungen", "annotation")) {
      this.db.exec("ALTER TABLE buchungen ADD COLUMN annotation TEXT;");
    }
    if (!hasColumn(this.db, "buchung_lines", "annotation")) {
      this.db.exec("ALTER TABLE buchung_lines ADD COLUMN annotation TEXT;");
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS buchungen_changelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buchung_id TEXT,
        buchung_line_id INTEGER,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        change_reason TEXT,
        FOREIGN KEY (buchung_id) REFERENCES buchungen(id) ON DELETE CASCADE,
        FOREIGN KEY (buchung_line_id) REFERENCES buchung_lines(id) ON DELETE CASCADE
      );
    `);
  }

  seedAccountCatalog() {
    const timestamp = new Date().toISOString();
    const insertStatement = this.db.prepare(`
      INSERT INTO account_catalog (
        chart_type, purpose_key, account_code, account_name, account_category, tax_rate, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chart_type, purpose_key) DO UPDATE SET
        account_code = excluded.account_code,
        account_name = excluded.account_name,
        account_category = excluded.account_category,
        tax_rate = excluded.tax_rate,
        is_active = 1,
        updated_at = excluded.updated_at
    `);

    try {
      for (const account of ACCOUNT_CATALOG) {
        for (const chartType of SUPPORTED_CHART_TYPES) {
          const label = account.labels[chartType];
          insertStatement.run([
            chartType,
            account.purposeKey,
            label.code,
            label.name,
            account.category,
            account.taxRate,
            timestamp,
            timestamp,
          ]);
        }
      }
    } finally {
      insertStatement.free();
    }
  }

  upsertMandant(mandant) {
    const timestamp = new Date().toISOString();
    this.db.run(
      `
        INSERT INTO mandanten (
          id, legal_name, display_name, vat_id, legal_entity, industry, accounting_basis, bank_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          legal_name = excluded.legal_name,
          display_name = excluded.display_name,
          vat_id = excluded.vat_id,
          legal_entity = excluded.legal_entity,
          industry = excluded.industry,
          accounting_basis = excluded.accounting_basis,
          bank_name = excluded.bank_name,
          updated_at = excluded.updated_at
      `,
      [
        mandant.id,
        mandant.legalName,
        mandant.displayName,
        mandant.vatId || null,
        mandant.legalEntity,
        mandant.industry || null,
        mandant.accountingBasis || null,
        mandant.bankName || null,
        timestamp,
        timestamp,
      ],
    );
  }

  purgeBuchungsdaten() {
    this.db.exec(`
      DELETE FROM telegram_outbound_approvals;
      DELETE FROM telegram_ticket_audit_events;
      DELETE FROM telegram_message_tickets;
      DELETE FROM telegram_documents;
      DELETE FROM telegram_submissions;
      DELETE FROM buchung_lines;
      DELETE FROM buchungen;
      DELETE FROM mandanten;
    `);
  }

  validatePurposeKeys(lines) {
    const known = new Set(
      queryAll(this.db, "SELECT DISTINCT purpose_key FROM account_catalog WHERE is_active = 1").map(
        (row) => row.purpose_key,
      ),
    );
    for (const line of lines) {
      if (!known.has(line.purposeKey)) {
        throw new Error(`Unknown purposeKey: ${line.purposeKey}`);
      }
    }
  }

  createBooking(booking) {
    if (!booking.mandantId) {
      throw new Error("mandantId is required.");
    }
    if (!booking.postingDate) {
      throw new Error("postingDate is required.");
    }
    if (!booking.counterparty) {
      throw new Error("counterparty is required.");
    }
    if (!booking.description) {
      throw new Error("description is required.");
    }
    if (!["ready", "needs_review"].includes(booking.status)) {
      throw new Error("status must be ready or needs_review.");
    }
    if (!Array.isArray(booking.lines) || booking.lines.length < 2) {
      throw new Error("At least two booking lines are required.");
    }

    const normalizedLines = booking.lines.map((line, index) => normalizeLine(line, index + 1));
    this.validatePurposeKeys(normalizedLines);

    const debitTotal = roundCurrency(
      normalizedLines
        .filter((line) => line.entryDirection === "debit")
        .reduce((sum, line) => sum + line.amountEur, 0),
    );
    const creditTotal = roundCurrency(
      normalizedLines
        .filter((line) => line.entryDirection === "credit")
        .reduce((sum, line) => sum + line.amountEur, 0),
    );
    if (debitTotal !== creditTotal) {
      throw new Error(`Booking is not balanced: debit ${debitTotal} != credit ${creditTotal}`);
    }

    const vatLines = normalizedLines.filter((line) => line.purposeKey.startsWith("INPUT_VAT") || line.purposeKey.startsWith("OUTPUT_VAT"));
    const vatAmountEur = booking.vatAmountEur != null
      ? roundCurrency(booking.vatAmountEur)
      : roundCurrency(vatLines.reduce((sum, line) => sum + line.amountEur, 0));
    const bankLikeLine = normalizedLines.find((line) => line.purposeKey === "BANK");
    const grossAmountEur = booking.grossAmountEur != null
      ? roundCurrency(booking.grossAmountEur)
      : roundCurrency(bankLikeLine ? bankLikeLine.amountEur : debitTotal);
    const netAmountEur = booking.netAmountEur != null
      ? roundCurrency(booking.netAmountEur)
      : roundCurrency(grossAmountEur - vatAmountEur);

    const timestamp = new Date().toISOString();
    const bookingId = booking.id || randomUUID();

    this.db.run(
      `
        INSERT INTO buchungen (
          id, mandant_id, source_type, source_reference, posting_date, counterparty, description, status,
          gross_amount_eur, net_amount_eur, vat_amount_eur, annotation, currency, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        bookingId,
        booking.mandantId,
        booking.sourceType || "manual",
        booking.sourceReference || bookingId,
        booking.postingDate,
        booking.counterparty,
        booking.description,
        booking.status,
        grossAmountEur,
        netAmountEur,
        vatAmountEur,
        normalizeOptionalString(booking.annotation),
        booking.currency || "EUR",
        timestamp,
        timestamp,
      ],
    );

    const insertLine = this.db.prepare(`
      INSERT INTO buchung_lines (
        buchung_id, line_index, purpose_key, entry_direction, amount_eur, tax_rate, memo, annotation, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const line of normalizedLines) {
        insertLine.run([
          bookingId,
          line.lineIndex,
          line.purposeKey,
          line.entryDirection,
          line.amountEur,
          line.taxRate,
          line.memo || null,
          line.annotation,
          timestamp,
        ]);
      }
    } finally {
      insertLine.free();
    }

    return this.getBookingById(bookingId, "SKR03");
  }

  ingestTelegramSubmission(submission, chartType = "SKR03") {
    assertChartType(chartType);

    if (!submission?.mandantId) {
      throw new Error("Telegram submission requires mandantId.");
    }
    if (!this.getMandant(submission.mandantId)) {
      throw new Error(`Mandant not found: ${submission.mandantId}`);
    }
    if (!Array.isArray(submission.documents) || submission.documents.length === 0) {
      throw new Error("Telegram submission requires at least one normalized document.");
    }

    const timestamp = new Date().toISOString();
    const submissionId = submission.submissionId || randomUUID();

    this.db.run(
      `
        INSERT INTO telegram_submissions (
          id, mandant_id, channel, source_label, telegram_chat_id, sender_name, submitted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        submissionId,
        submission.mandantId,
        submission.channel || "telegram",
        submission.sourceLabel || "Telegram document intake",
        String(submission.telegramChatId || "unknown-chat"),
        submission.senderName || "Unknown sender",
        submission.submittedAt || timestamp,
        timestamp,
        timestamp,
      ],
    );

    const persistedDocuments = [];
    const insertDocument = this.db.prepare(`
      INSERT INTO telegram_documents (
        id, submission_id, mandant_id, telegram_message_id, telegram_file_id, file_name, mime_type,
        document_type, direction, counterparty, document_date, service_period_start, service_period_end,
        description, status, confidence, currency, vat_rate, gross_amount_eur, net_amount_eur, vat_amount_eur,
        purpose_key, source_link, extracted_json, raw_payload_json, linked_booking_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      for (const document of submission.documents) {
        const booking = document.bookingProposal
          ? this.createBooking(document.bookingProposal)
          : null;

        insertDocument.run([
          document.id || randomUUID(),
          submissionId,
          submission.mandantId,
          document.telegramMessageId || null,
          document.telegramFileId || null,
          document.fileName,
          document.mimeType,
          document.documentType,
          document.direction,
          document.counterparty,
          document.documentDate || null,
          document.servicePeriodStart || null,
          document.servicePeriodEnd || null,
          document.description,
          document.status,
          document.confidence,
          document.currency || "EUR",
          document.vatRate || 0,
          document.grossAmountEur,
          document.netAmountEur,
          document.vatAmountEur,
          document.purposeKey || null,
          document.sourceLink || null,
          JSON.stringify(document.extractedFields || {}),
          JSON.stringify(document.rawPayload || {}),
          booking?.id || null,
          timestamp,
          timestamp,
        ]);

        persistedDocuments.push({
          id: document.id,
          submissionId,
          mandantId: submission.mandantId,
          telegramMessageId: document.telegramMessageId,
          telegramFileId: document.telegramFileId,
          fileName: document.fileName,
          mimeType: document.mimeType,
          documentType: document.documentType,
          direction: document.direction,
          counterparty: document.counterparty,
          documentDate: document.documentDate,
          servicePeriodStart: document.servicePeriodStart,
          servicePeriodEnd: document.servicePeriodEnd,
          description: document.description,
          status: document.status,
          confidence: document.confidence,
          currency: document.currency,
          vatRate: document.vatRate || 0,
          grossAmountEur: document.grossAmountEur,
          netAmountEur: document.netAmountEur,
          vatAmountEur: document.vatAmountEur,
          purposeKey: document.purposeKey,
          sourceLink: document.sourceLink,
          extractedFields: document.extractedFields || {},
          rawPayload: document.rawPayload || {},
          linkedBooking: booking ? this.getBookingById(booking.id, chartType) : null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    } finally {
      insertDocument.free();
    }

    return {
      submission: {
        id: submissionId,
        mandantId: submission.mandantId,
        channel: submission.channel || "telegram",
        sourceLabel: submission.sourceLabel || "Telegram document intake",
        telegramChatId: String(submission.telegramChatId || "unknown-chat"),
        senderName: submission.senderName || "Unknown sender",
        submittedAt: submission.submittedAt || timestamp,
        documentCount: persistedDocuments.length,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      documents: persistedDocuments,
    };
  }

  async reseedFromFixtures() {
    const fixtures = await loadFixtureData();
    this.purgeBuchungsdaten();
    this.upsertMandant(CLIENT_CONTEXT);

    for (const booking of buildSeedBookings(fixtures)) {
      this.createBooking(booking);
    }

    await this.save();
  }

  async syncAdditionalSeedBookings() {
    const fixtures = await loadFixtureData();
    const additionalBookings = fixtures.additionalBookings || [];
    let created = 0;
    let skipped = 0;

    this.upsertMandant(CLIENT_CONTEXT);

    for (const booking of additionalBookings) {
      if (booking.id && this.getBookingById(booking.id, "SKR03")) {
        skipped += 1;
        continue;
      }
      this.createBooking(booking);
      created += 1;
    }

    await this.save();

    return {
      total: additionalBookings.length,
      created,
      skipped,
    };
  }

  updateMandant(mandantId, patch) {
    const existing = this.getMandant(mandantId);
    if (!existing) {
      throw new Error(`Mandant not found: ${mandantId}`);
    }

    const next = {
      id: existing.id,
      legalName: patch.legalName ?? existing.legalName,
      displayName: patch.displayName ?? existing.displayName,
      vatId: patch.vatId ?? existing.vatId,
      legalEntity: patch.legalEntity ?? existing.legalEntity,
      industry: patch.industry ?? existing.industry,
      accountingBasis: patch.accountingBasis ?? existing.accountingBasis,
      bankName: patch.bankName ?? existing.bankName,
    };

    if (!next.legalName || !next.displayName || !next.legalEntity) {
      throw new Error("legalName, displayName, and legalEntity are required.");
    }

    this.upsertMandant(next);
    return this.getMandant(mandantId);
  }

  deleteMandant(mandantId) {
    if (!this.getMandant(mandantId)) {
      throw new Error(`Mandant not found: ${mandantId}`);
    }
    this.db.run("DELETE FROM mandanten WHERE id = ?", [mandantId]);
  }

  listMandanten() {
    return queryAll(
      this.db,
      `
        SELECT
          m.*,
          COUNT(DISTINCT b.id) AS booking_count
        FROM mandanten m
        LEFT JOIN buchungen b ON b.mandant_id = m.id
        GROUP BY m.id
        ORDER BY m.display_name ASC
      `,
    ).map((row) => ({
      id: row.id,
      legalName: row.legal_name,
      displayName: row.display_name,
      vatId: row.vat_id,
      legalEntity: row.legal_entity,
      industry: row.industry,
      accountingBasis: row.accounting_basis,
      bankName: row.bank_name,
      bookingCount: Number(row.booking_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getMandant(mandantId) {
    const mandant = queryOne(
      this.db,
      `
        SELECT
          m.*,
          COUNT(DISTINCT b.id) AS booking_count
        FROM mandanten m
        LEFT JOIN buchungen b ON b.mandant_id = m.id
        WHERE m.id = ?
        GROUP BY m.id
      `,
      [mandantId],
    );

    if (!mandant) {
      return null;
    }

    return {
      id: mandant.id,
      legalName: mandant.legal_name,
      displayName: mandant.display_name,
      vatId: mandant.vat_id,
      legalEntity: mandant.legal_entity,
      industry: mandant.industry,
      accountingBasis: mandant.accounting_basis,
      bankName: mandant.bank_name,
      bookingCount: Number(mandant.booking_count || 0),
      createdAt: mandant.created_at,
      updatedAt: mandant.updated_at,
    };
  }

  listAccountCatalog(chartType = null) {
    if (chartType) {
      assertChartType(chartType);
    }
    return queryAll(
      this.db,
      `
        SELECT id, chart_type, purpose_key, account_code, account_name, account_category, tax_rate, is_active, created_at, updated_at
        FROM account_catalog
        ${chartType ? "WHERE chart_type = ?" : ""}
        ORDER BY chart_type ASC, account_code ASC
      `,
      chartType ? [chartType] : [],
    ).map((row) => ({
      id: Number(row.id),
      chartType: row.chart_type,
      purposeKey: row.purpose_key,
      accountCode: row.account_code,
      accountName: row.account_name,
      category: row.account_category,
      taxRate: Number(row.tax_rate),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getAccountCatalogEntry(entryId) {
    const row = queryOne(
      this.db,
      `
        SELECT id, chart_type, purpose_key, account_code, account_name, account_category, tax_rate, is_active, created_at, updated_at
        FROM account_catalog
        WHERE id = ?
      `,
      [entryId],
    );
    if (!row) {
      return null;
    }
    return {
      id: Number(row.id),
      chartType: row.chart_type,
      purposeKey: row.purpose_key,
      accountCode: row.account_code,
      accountName: row.account_name,
      category: row.account_category,
      taxRate: Number(row.tax_rate),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createAccountCatalogEntry(entry) {
    assertChartType(entry.chartType);
    if (!entry.purposeKey || !entry.accountCode || !entry.accountName || !entry.category) {
      throw new Error("chartType, purposeKey, accountCode, accountName, and category are required.");
    }

    const timestamp = new Date().toISOString();
    this.db.run(
      `
        INSERT INTO account_catalog (
          chart_type, purpose_key, account_code, account_name, account_category, tax_rate, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        entry.chartType,
        entry.purposeKey,
        entry.accountCode,
        entry.accountName,
        entry.category,
        typeof entry.taxRate === "number" ? entry.taxRate : 0,
        entry.isActive === false ? 0 : 1,
        timestamp,
        timestamp,
      ],
    );

    return this.getAccountCatalogEntry(
      queryOne(this.db, "SELECT last_insert_rowid() AS id")?.id,
    );
  }

  updateAccountCatalogEntry(entryId, patch) {
    const existing = this.getAccountCatalogEntry(entryId);
    if (!existing) {
      throw new Error(`Account catalog entry not found: ${entryId}`);
    }

    const next = {
      chartType: patch.chartType ?? existing.chartType,
      purposeKey: patch.purposeKey ?? existing.purposeKey,
      accountCode: patch.accountCode ?? existing.accountCode,
      accountName: patch.accountName ?? existing.accountName,
      category: patch.category ?? existing.category,
      taxRate: patch.taxRate ?? existing.taxRate,
      isActive: patch.isActive ?? existing.isActive,
    };

    assertChartType(next.chartType);
    if (!next.purposeKey || !next.accountCode || !next.accountName || !next.category) {
      throw new Error("chartType, purposeKey, accountCode, accountName, and category are required.");
    }

    this.db.run(
      `
        UPDATE account_catalog
        SET
          chart_type = ?,
          purpose_key = ?,
          account_code = ?,
          account_name = ?,
          account_category = ?,
          tax_rate = ?,
          is_active = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        next.chartType,
        next.purposeKey,
        next.accountCode,
        next.accountName,
        next.category,
        next.taxRate,
        next.isActive ? 1 : 0,
        new Date().toISOString(),
        entryId,
      ],
    );

    return this.getAccountCatalogEntry(entryId);
  }

  deleteAccountCatalogEntry(entryId) {
    if (!this.getAccountCatalogEntry(entryId)) {
      throw new Error(`Account catalog entry not found: ${entryId}`);
    }
    this.db.run("DELETE FROM account_catalog WHERE id = ?", [entryId]);
  }

  getBookingById(bookingId, chartType) {
    assertChartType(chartType);
    const rows = queryAll(
      this.db,
      `
        SELECT
          b.id,
          b.mandant_id,
          b.source_type,
          b.source_reference,
          b.posting_date,
          b.counterparty,
          b.description,
          b.status,
          b.gross_amount_eur,
          b.net_amount_eur,
          b.vat_amount_eur,
          b.annotation,
          b.currency,
          b.created_at,
          b.updated_at,
          l.line_index,
          l.purpose_key,
          l.entry_direction,
          l.amount_eur,
          l.tax_rate,
          l.memo,
          l.annotation AS line_annotation,
          c.account_code,
          c.account_name
        FROM buchungen b
        LEFT JOIN buchung_lines l ON l.buchung_id = b.id
        LEFT JOIN account_catalog c
          ON c.purpose_key = l.purpose_key
         AND c.chart_type = ?
        WHERE b.id = ?
        ORDER BY l.line_index ASC
      `,
      [chartType, bookingId],
    );

    if (rows.length === 0) {
      return null;
    }

    return mapBookingRows(rows, chartType);
  }

  listBookings(mandantId, chartType) {
    assertChartType(chartType);
    const rows = queryAll(
      this.db,
      `
        SELECT
          b.id,
          b.mandant_id,
          b.source_type,
          b.source_reference,
          b.posting_date,
          b.counterparty,
          b.description,
          b.status,
          b.gross_amount_eur,
          b.net_amount_eur,
          b.vat_amount_eur,
          b.annotation,
          b.currency,
          b.created_at,
          b.updated_at,
          l.line_index,
          l.purpose_key,
          l.entry_direction,
          l.amount_eur,
          l.tax_rate,
          l.memo,
          l.annotation AS line_annotation,
          c.account_code,
          c.account_name
        FROM buchungen b
        LEFT JOIN buchung_lines l ON l.buchung_id = b.id
        LEFT JOIN account_catalog c
          ON c.purpose_key = l.purpose_key
         AND c.chart_type = ?
        WHERE b.mandant_id = ?
        ORDER BY b.posting_date ASC, b.counterparty ASC, l.line_index ASC
      `,
      [chartType, mandantId],
    );

    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, []);
      }
      grouped.get(row.id).push(row);
    }

    return Array.from(grouped.values()).map((group) => mapBookingRows(group, chartType));
  }

  listAllBookings(chartType, options = {}) {
    if (options.mandantId) {
      return this.listBookings(options.mandantId, chartType);
    }

    const mandanten = this.listMandanten();
    return mandanten.flatMap((mandant) => this.listBookings(mandant.id, chartType));
  }

  insertBuchungenChangelog(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
      return;
    }

    const statement = this.db.prepare(`
      INSERT INTO buchungen_changelog (
        buchung_id, buchung_line_id, field_name, old_value, new_value, changed_by, changed_at, change_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const changedAt = new Date().toISOString();

    try {
      for (const entry of entries) {
        statement.run([
          entry.buchungId || null,
          entry.buchungLineId || null,
          entry.fieldName,
          stringifyChangelogValue(entry.oldValue),
          stringifyChangelogValue(entry.newValue),
          entry.changedBy || "steuerberater-db-ui",
          entry.changedAt || changedAt,
          normalizeOptionalString(entry.changeReason),
        ]);
      }
    } finally {
      statement.free();
    }
  }

  updateBooking(bookingId, patch, options = {}) {
    const existing = this.getBookingById(bookingId, options.chartType || "SKR03");
    if (!existing) {
      throw new Error(`Booking not found: ${bookingId}`);
    }

    const next = {
      mandantId: patch.mandantId ?? existing.mandantId,
      sourceType: patch.sourceType ?? existing.sourceType,
      sourceReference: patch.sourceReference ?? existing.sourceReference,
      postingDate: patch.postingDate ?? existing.postingDate,
      counterparty: patch.counterparty ?? existing.counterparty,
      description: patch.description ?? existing.description,
      status: patch.status ?? existing.status,
      grossAmountEur: patch.grossAmountEur ?? existing.grossAmountEur,
      netAmountEur: patch.netAmountEur ?? existing.netAmountEur,
      vatAmountEur: patch.vatAmountEur ?? existing.vatAmountEur,
      annotation: patch.annotation ?? existing.annotation,
      currency: patch.currency ?? existing.currency,
    };

    if (!this.getMandant(next.mandantId)) {
      throw new Error(`Mandant not found: ${next.mandantId}`);
    }
    if (!["ready", "needs_review"].includes(next.status)) {
      throw new Error("status must be ready or needs_review.");
    }

    const changelogEntries = [];
    for (const [fieldName, oldValue, newValue] of [
      ["mandant_id", existing.mandantId, next.mandantId],
      ["source_type", existing.sourceType, next.sourceType],
      ["source_reference", existing.sourceReference, next.sourceReference],
      ["posting_date", existing.postingDate, next.postingDate],
      ["counterparty", existing.counterparty, next.counterparty],
      ["description", existing.description, next.description],
      ["status", existing.status, next.status],
      ["gross_amount_eur", existing.grossAmountEur, roundCurrency(next.grossAmountEur)],
      ["net_amount_eur", existing.netAmountEur, roundCurrency(next.netAmountEur)],
      ["vat_amount_eur", existing.vatAmountEur, roundCurrency(next.vatAmountEur)],
      ["annotation", existing.annotation, normalizeOptionalString(next.annotation)],
      ["currency", existing.currency, next.currency],
    ]) {
      if (stringifyChangelogValue(oldValue) !== stringifyChangelogValue(newValue)) {
        changelogEntries.push({
          buchungId: bookingId,
          fieldName,
          oldValue,
          newValue,
          changedBy: options.changedBy,
          changeReason: options.changeReason,
        });
      }
    }

    this.insertBuchungenChangelog(changelogEntries);

    this.db.run(
      `
        UPDATE buchungen
        SET
          mandant_id = ?,
          source_type = ?,
          source_reference = ?,
          posting_date = ?,
          counterparty = ?,
          description = ?,
          status = ?,
          gross_amount_eur = ?,
          net_amount_eur = ?,
          vat_amount_eur = ?,
          annotation = ?,
          currency = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        next.mandantId,
        next.sourceType,
        next.sourceReference,
        next.postingDate,
        next.counterparty,
        next.description,
        next.status,
        roundCurrency(next.grossAmountEur),
        roundCurrency(next.netAmountEur),
        roundCurrency(next.vatAmountEur),
        normalizeOptionalString(next.annotation),
        next.currency,
        new Date().toISOString(),
        bookingId,
      ],
    );

    return this.getBookingById(bookingId, options.chartType || "SKR03");
  }

  deleteBooking(bookingId) {
    if (!this.getBookingById(bookingId, "SKR03")) {
      throw new Error(`Booking not found: ${bookingId}`);
    }
    this.db.run("DELETE FROM buchungen WHERE id = ?", [bookingId]);
  }

  listBookingLines(chartType, options = {}) {
    assertChartType(chartType);
    return queryAll(
      this.db,
      `
        SELECT
          l.id,
          l.buchung_id,
          l.line_index,
          l.purpose_key,
          l.entry_direction,
          l.amount_eur,
          l.tax_rate,
          l.memo,
          l.annotation,
          l.created_at,
          b.mandant_id,
          b.counterparty,
          b.posting_date,
          c.account_code,
          c.account_name
        FROM buchung_lines l
        JOIN buchungen b ON b.id = l.buchung_id
        LEFT JOIN account_catalog c
          ON c.purpose_key = l.purpose_key
         AND c.chart_type = ?
        ${options.buchungId ? "WHERE l.buchung_id = ?" : ""}
        ORDER BY b.posting_date ASC, l.buchung_id ASC, l.line_index ASC
      `,
      options.buchungId ? [chartType, options.buchungId] : [chartType],
    ).map((row) => ({
      id: Number(row.id),
      buchungId: row.buchung_id,
      mandantId: row.mandant_id,
      counterparty: row.counterparty,
      postingDate: row.posting_date,
      lineIndex: Number(row.line_index),
      purposeKey: row.purpose_key,
      accountCode: row.account_code,
      accountName: row.account_name,
      entryDirection: row.entry_direction,
      amountEur: Number(row.amount_eur),
      taxRate: Number(row.tax_rate),
      memo: row.memo,
      annotation: row.annotation,
      createdAt: row.created_at,
    }));
  }

  getBookingLineById(lineId, chartType) {
    return this.listBookingLines(chartType, {}).find((line) => line.id === Number(lineId)) || null;
  }

  createBookingLine(line) {
    if (!line.buchungId) {
      throw new Error("buchungId is required.");
    }
    if (!this.getBookingById(line.buchungId, "SKR03")) {
      throw new Error(`Booking not found: ${line.buchungId}`);
    }

    const normalized = normalizeLine(line, Number(line.lineIndex));
    this.validatePurposeKeys([normalized]);
    const timestamp = new Date().toISOString();

    this.db.run(
      `
        INSERT INTO buchung_lines (
          buchung_id, line_index, purpose_key, entry_direction, amount_eur, tax_rate, memo, annotation, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        line.buchungId,
        normalized.lineIndex,
        normalized.purposeKey,
        normalized.entryDirection,
        normalized.amountEur,
        normalized.taxRate,
        normalized.memo || null,
        normalized.annotation,
        timestamp,
      ],
    );

    return this.getBookingLineById(queryOne(this.db, "SELECT last_insert_rowid() AS id")?.id, "SKR03");
  }

  updateBookingLine(lineId, patch, options = {}) {
    const existing = this.getBookingLineById(lineId, options.chartType || "SKR03");
    if (!existing) {
      throw new Error(`Booking line not found: ${lineId}`);
    }

    const next = normalizeLine(
      {
        purposeKey: patch.purposeKey ?? existing.purposeKey,
        entryDirection: patch.entryDirection ?? existing.entryDirection,
        amountEur: patch.amountEur ?? existing.amountEur,
        taxRate: patch.taxRate ?? existing.taxRate,
        memo: patch.memo ?? existing.memo,
        annotation: patch.annotation ?? existing.annotation,
      },
      Number(patch.lineIndex ?? existing.lineIndex),
    );

    this.validatePurposeKeys([next]);

    const changelogEntries = [];
    for (const [fieldName, oldValue, newValue] of [
      ["line_index", existing.lineIndex, next.lineIndex],
      ["purpose_key", existing.purposeKey, next.purposeKey],
      ["entry_direction", existing.entryDirection, next.entryDirection],
      ["amount_eur", existing.amountEur, next.amountEur],
      ["tax_rate", existing.taxRate, next.taxRate],
      ["memo", existing.memo, next.memo],
      ["annotation", existing.annotation, next.annotation],
    ]) {
      if (stringifyChangelogValue(oldValue) !== stringifyChangelogValue(newValue)) {
        changelogEntries.push({
          buchungId: existing.buchungId,
          buchungLineId: Number(lineId),
          fieldName,
          oldValue,
          newValue,
          changedBy: options.changedBy,
          changeReason: options.changeReason,
        });
      }
    }

    this.insertBuchungenChangelog(changelogEntries);

    this.db.run(
      `
        UPDATE buchung_lines
        SET
          line_index = ?,
          purpose_key = ?,
          entry_direction = ?,
          amount_eur = ?,
          tax_rate = ?,
          memo = ?,
          annotation = ?
        WHERE id = ?
      `,
      [
        next.lineIndex,
        next.purposeKey,
        next.entryDirection,
        next.amountEur,
        next.taxRate,
        next.memo || null,
        next.annotation,
        lineId,
      ],
    );

    return this.getBookingLineById(lineId, options.chartType || "SKR03");
  }

  deleteBookingLine(lineId) {
    if (!this.getBookingLineById(lineId, "SKR03")) {
      throw new Error(`Booking line not found: ${lineId}`);
    }
    this.db.run("DELETE FROM buchung_lines WHERE id = ?", [lineId]);
  }

  listBuchungenChangelog(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 200), 1000));
    const clauses = [];
    const params = [];

    if (options.buchungId) {
      clauses.push("buchung_id = ?");
      params.push(options.buchungId);
    }
    if (options.buchungLineId) {
      clauses.push("buchung_line_id = ?");
      params.push(Number(options.buchungLineId));
    }

    return queryAll(
      this.db,
      `
        SELECT id, buchung_id, buchung_line_id, field_name, old_value, new_value, changed_by, changed_at, change_reason
        FROM buchungen_changelog
        ${clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY datetime(changed_at) DESC, id DESC
        LIMIT ?
      `,
      [...params, limit],
    ).map((row) => ({
      id: Number(row.id),
      buchungId: row.buchung_id,
      buchungLineId: row.buchung_line_id == null ? null : Number(row.buchung_line_id),
      fieldName: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
      changeReason: row.change_reason,
    }));
  }

  listTelegramSubmissions(mandantId) {
    return queryAll(
      this.db,
      `
        SELECT
          s.*,
          COUNT(d.id) AS document_count
        FROM telegram_submissions s
        LEFT JOIN telegram_documents d ON d.submission_id = s.id
        WHERE s.mandant_id = ?
        GROUP BY s.id
        ORDER BY s.submitted_at DESC, s.created_at DESC
      `,
      [mandantId],
    ).map((row) => ({
      id: row.id,
      mandantId: row.mandant_id,
      channel: row.channel,
      sourceLabel: row.source_label,
      telegramChatId: row.telegram_chat_id,
      senderName: row.sender_name,
      submittedAt: row.submitted_at,
      documentCount: Number(row.document_count || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  listTelegramDocuments(mandantId, chartType) {
    assertChartType(chartType);
    return queryAll(
      this.db,
      `
        SELECT *
        FROM telegram_documents
        WHERE mandant_id = ?
        ORDER BY COALESCE(document_date, created_at) DESC, created_at DESC
      `,
      [mandantId],
    ).map((row) => ({
      id: row.id,
      submissionId: row.submission_id,
      mandantId: row.mandant_id,
      telegramMessageId: row.telegram_message_id,
      telegramFileId: row.telegram_file_id,
      fileName: row.file_name,
      mimeType: row.mime_type,
      documentType: row.document_type,
      direction: row.direction,
      counterparty: row.counterparty,
      documentDate: row.document_date,
      servicePeriodStart: row.service_period_start,
      servicePeriodEnd: row.service_period_end,
      description: row.description,
      status: row.status,
      confidence: row.confidence,
      currency: row.currency,
      vatRate: Number(row.vat_rate || 0),
      grossAmountEur: row.gross_amount_eur == null ? null : Number(row.gross_amount_eur),
      netAmountEur: row.net_amount_eur == null ? null : Number(row.net_amount_eur),
      vatAmountEur: row.vat_amount_eur == null ? null : Number(row.vat_amount_eur),
      purposeKey: row.purpose_key,
      sourceLink: row.source_link,
      extractedFields: JSON.parse(row.extracted_json || "{}"),
      rawPayload: JSON.parse(row.raw_payload_json || "{}"),
      linkedBooking: row.linked_booking_id
        ? this.getBookingById(row.linked_booking_id, chartType)
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  listDocuments() {
    return queryAll(
      this.db,
      `
        SELECT *
        FROM telegram_documents
        ORDER BY datetime(created_at) DESC, id DESC
      `,
    ).map(mapTelegramDocumentRow);
  }

  getDocumentById(documentId) {
    const row = queryOne(this.db, "SELECT * FROM telegram_documents WHERE id = ?", [documentId]);
    return row ? mapTelegramDocumentRow(row) : null;
  }

  updateTelegramDocument(documentId, patch) {
    const existing = this.getDocumentById(documentId);
    if (!existing) {
      throw new Error(`Telegram document not found: ${documentId}`);
    }

    const next = {
      fileName: patch.fileName ?? existing.fileName,
      mimeType: patch.mimeType ?? existing.mimeType,
      documentType: patch.documentType ?? existing.documentType,
      direction: patch.direction ?? existing.direction,
      counterparty: patch.counterparty ?? existing.counterparty,
      documentDate: patch.documentDate ?? existing.documentDate,
      servicePeriodStart: patch.servicePeriodStart ?? existing.servicePeriodStart,
      servicePeriodEnd: patch.servicePeriodEnd ?? existing.servicePeriodEnd,
      description: patch.description ?? existing.description,
      status: patch.status ?? existing.status,
      confidence: patch.confidence ?? existing.confidence,
      currency: patch.currency ?? existing.currency,
      vatRate: patch.vatRate ?? existing.vatRate,
      grossAmountEur:
        patch.grossAmountEur === "" ? null : patch.grossAmountEur ?? existing.grossAmountEur,
      netAmountEur: patch.netAmountEur === "" ? null : patch.netAmountEur ?? existing.netAmountEur,
      vatAmountEur: patch.vatAmountEur === "" ? null : patch.vatAmountEur ?? existing.vatAmountEur,
      purposeKey: patch.purposeKey ?? existing.purposeKey,
      sourceLink: patch.sourceLink ?? existing.sourceLink,
      linkedBookingId:
        patch.linkedBookingId === "" ? null : patch.linkedBookingId ?? existing.linkedBookingId,
      extractedFields: patch.extractedFields ?? existing.extractedFields,
      rawPayload: patch.rawPayload ?? existing.rawPayload,
    };

    if (!next.fileName || !next.mimeType || !next.counterparty || !next.description || !next.confidence) {
      throw new Error("fileName, mimeType, counterparty, description, and confidence are required.");
    }
    if (!["supplier_invoice", "customer_invoice", "receipt", "contract"].includes(next.documentType)) {
      throw new Error("Unsupported documentType.");
    }
    if (!["expense", "revenue", "agreement"].includes(next.direction)) {
      throw new Error("Unsupported direction.");
    }
    if (!["ready", "needs_review", "reference_only"].includes(next.status)) {
      throw new Error("Unsupported status.");
    }
    if (next.linkedBookingId && !this.getBookingById(next.linkedBookingId, "SKR03")) {
      throw new Error(`Linked booking not found: ${next.linkedBookingId}`);
    }

    const timestamp = new Date().toISOString();
    this.db.run(
      `
        UPDATE telegram_documents
        SET
          file_name = ?,
          mime_type = ?,
          document_type = ?,
          direction = ?,
          counterparty = ?,
          document_date = ?,
          service_period_start = ?,
          service_period_end = ?,
          description = ?,
          status = ?,
          confidence = ?,
          currency = ?,
          vat_rate = ?,
          gross_amount_eur = ?,
          net_amount_eur = ?,
          vat_amount_eur = ?,
          purpose_key = ?,
          source_link = ?,
          extracted_json = ?,
          raw_payload_json = ?,
          linked_booking_id = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        next.fileName,
        next.mimeType,
        next.documentType,
        next.direction,
        next.counterparty,
        next.documentDate || null,
        next.servicePeriodStart || null,
        next.servicePeriodEnd || null,
        next.description,
        next.status,
        next.confidence,
        next.currency || "EUR",
        next.vatRate == null ? 0 : Number(next.vatRate),
        next.grossAmountEur == null ? null : Number(next.grossAmountEur),
        next.netAmountEur == null ? null : Number(next.netAmountEur),
        next.vatAmountEur == null ? null : Number(next.vatAmountEur),
        next.purposeKey || null,
        next.sourceLink || null,
        JSON.stringify(next.extractedFields || {}),
        JSON.stringify(next.rawPayload || {}),
        next.linkedBookingId || null,
        timestamp,
        documentId,
      ],
    );

    return this.getDocumentById(documentId);
  }

  updateTelegramDocumentSource(documentId, patch) {
    const existing = this.getDocumentById(documentId);
    if (!existing) {
      throw new Error(`Telegram document not found: ${documentId}`);
    }

    const nextRawPayload = {
      ...existing.rawPayload,
      ...(patch.rawPayloadPatch || {}),
    };
    const timestamp = new Date().toISOString();

    this.db.run(
      `
        UPDATE telegram_documents
        SET source_link = ?, raw_payload_json = ?, updated_at = ?
        WHERE id = ?
      `,
      [
        patch.sourceLink != null ? patch.sourceLink : existing.sourceLink,
        JSON.stringify(nextRawPayload),
        timestamp,
        documentId,
      ],
    );

    return this.getDocumentById(documentId);
  }

  countDocumentsBySourceLink(sourceLink) {
    if (!sourceLink) {
      return 0;
    }
    return Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM telegram_documents WHERE source_link = ?", [
        sourceLink,
      ])?.count || 0,
    );
  }

  deleteTelegramDocument(documentId) {
    const existing = this.getDocumentById(documentId);
    if (!existing) {
      throw new Error(`Telegram document not found: ${documentId}`);
    }
    this.db.run("DELETE FROM telegram_documents WHERE id = ?", [documentId]);
    return existing;
  }

  getTelegramMessageTicketById(ticketId) {
    const row = queryOne(
      this.db,
      `
        SELECT *
        FROM telegram_message_tickets
        WHERE id = ?
      `,
      [ticketId],
    );

    return row ? mapTelegramMessageTicketRow(row) : null;
  }

  getTelegramMessageTicketByMessageId(telegramMessageId) {
    const row = queryOne(
      this.db,
      `
        SELECT *
        FROM telegram_message_tickets
        WHERE telegram_message_id = ?
      `,
      [String(telegramMessageId)],
    );

    return row ? mapTelegramMessageTicketRow(row) : null;
  }

  listTelegramMessageTicketsBySubmissionId(submissionId) {
    return queryAll(
      this.db,
      `
        SELECT *
        FROM telegram_message_tickets
        WHERE submission_id = ?
        ORDER BY datetime(created_at) ASC, id ASC
      `,
      [submissionId],
    ).map(mapTelegramMessageTicketRow);
  }

  createTelegramMessageTicket(ticket) {
    if (!ticket?.telegramMessageId) {
      throw new Error("telegramMessageId is required for Telegram message tickets.");
    }
    if (!ticket?.channel) {
      throw new Error("channel is required for Telegram message tickets.");
    }
    if (!ticket?.routeKey || !ticket?.routeLabel || !ticket?.downstreamPath) {
      throw new Error("routeKey, routeLabel, and downstreamPath are required for Telegram message tickets.");
    }

    const timestamp = new Date().toISOString();
    const ticketId = ticket.id || randomUUID();
    this.db.run(
      `
        INSERT INTO telegram_message_tickets (
          id, telegram_message_id, telegram_update_id, channel, bot_key, telegram_chat_id,
          sender_name, sender_username, message_body, message_type, mandant_id, unmatched_mandant,
          intent, intent_confidence, route_key, route_label, downstream_path, issue_type_label,
          assignee_agent_id, assignee_agent_name, paperclip_issue_id, paperclip_issue_identifier,
          submission_id, attachment_json, metadata_json, raw_update_json, processing_error,
          fallback_used, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ticketId,
        String(ticket.telegramMessageId),
        ticket.telegramUpdateId != null ? String(ticket.telegramUpdateId) : null,
        ticket.channel,
        ticket.botKey || ticket.channel,
        String(ticket.telegramChatId || "unknown-chat"),
        ticket.senderName || "Unknown sender",
        ticket.senderUsername || null,
        ticket.messageBody || "",
        ticket.messageType || "unknown",
        ticket.mandantId || null,
        ticket.unmatchedMandant ? 1 : 0,
        ticket.intent || null,
        typeof ticket.intentConfidence === "number" ? ticket.intentConfidence : 0,
        ticket.routeKey,
        ticket.routeLabel,
        ticket.downstreamPath,
        ticket.issueTypeLabel || ticket.routeKey,
        ticket.assigneeAgentId || null,
        ticket.assigneeAgentName || ticket.routeLabel,
        ticket.paperclipIssueId || null,
        ticket.paperclipIssueIdentifier || null,
        ticket.submissionId || null,
        JSON.stringify(ticket.attachments || []),
        JSON.stringify(ticket.metadata || {}),
        JSON.stringify(ticket.rawUpdate || {}),
        ticket.processingError || null,
        ticket.fallbackUsed ? 1 : 0,
        timestamp,
        timestamp,
      ],
    );

    return this.getTelegramMessageTicketById(ticketId);
  }

  updateTelegramMessageTicket(ticketId, patch) {
    const existing = this.getTelegramMessageTicketById(ticketId);
    if (!existing) {
      throw new Error(`Telegram message ticket not found: ${ticketId}`);
    }

    const next = {
      ...existing,
      ...patch,
      attachments: patch.attachments != null ? patch.attachments : existing.attachments,
      metadata: patch.metadata != null ? patch.metadata : existing.metadata,
      rawUpdate: patch.rawUpdate != null ? patch.rawUpdate : existing.rawUpdate,
    };
    const timestamp = new Date().toISOString();

    this.db.run(
      `
        UPDATE telegram_message_tickets
        SET
          telegram_update_id = ?,
          channel = ?,
          bot_key = ?,
          telegram_chat_id = ?,
          sender_name = ?,
          sender_username = ?,
          message_body = ?,
          message_type = ?,
          mandant_id = ?,
          unmatched_mandant = ?,
          intent = ?,
          intent_confidence = ?,
          route_key = ?,
          route_label = ?,
          downstream_path = ?,
          issue_type_label = ?,
          assignee_agent_id = ?,
          assignee_agent_name = ?,
          paperclip_issue_id = ?,
          paperclip_issue_identifier = ?,
          submission_id = ?,
          attachment_json = ?,
          metadata_json = ?,
          raw_update_json = ?,
          processing_error = ?,
          fallback_used = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [
        next.telegramUpdateId != null ? String(next.telegramUpdateId) : null,
        next.channel,
        next.botKey || next.channel,
        String(next.telegramChatId || "unknown-chat"),
        next.senderName || "Unknown sender",
        next.senderUsername || null,
        next.messageBody || "",
        next.messageType || "unknown",
        next.mandantId || null,
        next.unmatchedMandant ? 1 : 0,
        next.intent || null,
        typeof next.intentConfidence === "number" ? next.intentConfidence : 0,
        next.routeKey,
        next.routeLabel,
        next.downstreamPath,
        next.issueTypeLabel || next.routeKey,
        next.assigneeAgentId || null,
        next.assigneeAgentName || next.routeLabel,
        next.paperclipIssueId || null,
        next.paperclipIssueIdentifier || null,
        next.submissionId || null,
        JSON.stringify(next.attachments || []),
        JSON.stringify(next.metadata || {}),
        JSON.stringify(next.rawUpdate || {}),
        next.processingError || null,
        next.fallbackUsed ? 1 : 0,
        timestamp,
        ticketId,
      ],
    );

    return this.getTelegramMessageTicketById(ticketId);
  }

  addTelegramTicketAuditEvent(ticketId, stage, detail = {}) {
    const ticket = this.getTelegramMessageTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Telegram message ticket not found: ${ticketId}`);
    }

    this.db.run(
      `
        INSERT INTO telegram_ticket_audit_events (ticket_id, stage, detail_json, created_at)
        VALUES (?, ?, ?, ?)
      `,
      [ticketId, stage, JSON.stringify(detail), new Date().toISOString()],
    );
  }

  listTelegramTicketAuditEvents(ticketId) {
    return queryAll(
      this.db,
      `
        SELECT *
        FROM telegram_ticket_audit_events
        WHERE ticket_id = ?
        ORDER BY id ASC
      `,
      [ticketId],
    ).map((row) => ({
      id: Number(row.id),
      ticketId: row.ticket_id,
      stage: row.stage,
      detail: JSON.parse(row.detail_json || "{}"),
      createdAt: row.created_at,
    }));
  }

  ensureTelegramOutboundApproval(ticketId) {
    const ticket = this.getTelegramMessageTicketById(ticketId);
    if (!ticket) {
      throw new Error(`Telegram message ticket not found: ${ticketId}`);
    }

    const timestamp = new Date().toISOString();
    this.db.run(
      `
        INSERT INTO telegram_outbound_approvals (
          ticket_id, compliance_passed, compliance_passed_at, review_passed, review_passed_at,
          released_at, outbound_bot_key, outbound_chat_id, outbound_text, created_at, updated_at
        ) VALUES (?, 0, NULL, 0, NULL, NULL, NULL, NULL, NULL, ?, ?)
        ON CONFLICT(ticket_id) DO NOTHING
      `,
      [ticketId, timestamp, timestamp],
    );

    return this.getTelegramOutboundApproval(ticketId);
  }

  getTelegramOutboundApproval(ticketId) {
    const row = queryOne(
      this.db,
      `
        SELECT *
        FROM telegram_outbound_approvals
        WHERE ticket_id = ?
      `,
      [ticketId],
    );

    if (!row) {
      return null;
    }

    return {
      ticketId: row.ticket_id,
      compliancePassed: Boolean(row.compliance_passed),
      compliancePassedAt: row.compliance_passed_at,
      reviewPassed: Boolean(row.review_passed),
      reviewPassedAt: row.review_passed_at,
      releasedAt: row.released_at,
      outboundBotKey: row.outbound_bot_key,
      outboundChatId: row.outbound_chat_id,
      outboundText: row.outbound_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  approveTelegramOutboundStage(ticketId, stage) {
    const current = this.ensureTelegramOutboundApproval(ticketId);
    const timestamp = new Date().toISOString();

    if (stage === "compliance") {
      this.db.run(
        `
          UPDATE telegram_outbound_approvals
          SET compliance_passed = 1, compliance_passed_at = ?, updated_at = ?
          WHERE ticket_id = ?
        `,
        [timestamp, timestamp, ticketId],
      );
    } else if (stage === "review") {
      this.db.run(
        `
          UPDATE telegram_outbound_approvals
          SET review_passed = 1, review_passed_at = ?, updated_at = ?
          WHERE ticket_id = ?
        `,
        [timestamp, timestamp, ticketId],
      );
    } else {
      throw new Error(`Unknown outbound approval stage: ${stage}`);
    }

    return this.getTelegramOutboundApproval(ticketId) || current;
  }

  releaseTelegramOutbound(ticketId, outbound) {
    const approval = this.ensureTelegramOutboundApproval(ticketId);
    if (!approval.compliancePassed || !approval.reviewPassed) {
      throw new Error(
        "Client outbound is blocked until Compliance Guard and Steuerberater Review Copilot approvals are recorded.",
      );
    }

    const timestamp = new Date().toISOString();
    this.db.run(
      `
        UPDATE telegram_outbound_approvals
        SET
          released_at = ?,
          outbound_bot_key = ?,
          outbound_chat_id = ?,
          outbound_text = ?,
          updated_at = ?
        WHERE ticket_id = ?
      `,
      [
        timestamp,
        outbound.botKey,
        String(outbound.chatId),
        outbound.text,
        timestamp,
        ticketId,
      ],
    );

    return this.getTelegramOutboundApproval(ticketId);
  }

  getHealth() {
    const mandanten = Number(queryOne(this.db, "SELECT COUNT(*) AS count FROM mandanten")?.count || 0);
    const buchungen = Number(queryOne(this.db, "SELECT COUNT(*) AS count FROM buchungen")?.count || 0);
    const lines = Number(queryOne(this.db, "SELECT COUNT(*) AS count FROM buchung_lines")?.count || 0);
    const changelogEntries = Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM buchungen_changelog")?.count || 0,
    );
    const telegramSubmissions = Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM telegram_submissions")?.count || 0,
    );
    const telegramDocuments = Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM telegram_documents")?.count || 0,
    );
    const telegramMessageTickets = Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM telegram_message_tickets")?.count || 0,
    );
    const telegramTicketAuditEvents = Number(
      queryOne(this.db, "SELECT COUNT(*) AS count FROM telegram_ticket_audit_events")?.count || 0,
    );
    return {
      status: "ok",
      databasePath: this.filePath,
      supportedCharts: SUPPORTED_CHART_TYPES,
      mandanten,
      buchungen,
      lines,
      changelogEntries,
      telegramSubmissions,
      telegramDocuments,
      telegramMessageTickets,
      telegramTicketAuditEvents,
    };
  }
}

function mapTelegramDocumentRow(row) {
  const extractedFields = row.extracted_json ? JSON.parse(row.extracted_json) : {};
  const rawPayload = row.raw_payload_json ? JSON.parse(row.raw_payload_json) : {};
  return {
    id: row.id,
    submissionId: row.submission_id,
    mandantId: row.mandant_id,
    telegramMessageId: row.telegram_message_id,
    telegramFileId: row.telegram_file_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    documentType: row.document_type,
    direction: row.direction,
    counterparty: row.counterparty,
    documentDate: row.document_date,
    servicePeriodStart: row.service_period_start,
    servicePeriodEnd: row.service_period_end,
    description: row.description,
    status: row.status,
    confidence: row.confidence,
    currency: row.currency,
    vatRate: row.vat_rate == null ? null : Number(row.vat_rate),
    grossAmountEur: row.gross_amount_eur == null ? null : Number(row.gross_amount_eur),
    netAmountEur: row.net_amount_eur == null ? null : Number(row.net_amount_eur),
    vatAmountEur: row.vat_amount_eur == null ? null : Number(row.vat_amount_eur),
    purposeKey: row.purpose_key,
    sourceLink: row.source_link,
    extractedFields,
    rawPayload,
    linkedBookingId: row.linked_booking_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBookingRows(rows, chartType) {
  const [first] = rows;
  return {
    id: first.id,
    mandantId: first.mandant_id,
    chartType,
    sourceType: first.source_type,
    sourceReference: first.source_reference,
    postingDate: first.posting_date,
    counterparty: first.counterparty,
    description: first.description,
    status: first.status,
    grossAmountEur: Number(first.gross_amount_eur),
    netAmountEur: Number(first.net_amount_eur),
    vatAmountEur: Number(first.vat_amount_eur),
    annotation: first.annotation,
    currency: first.currency,
    createdAt: first.created_at,
    updatedAt: first.updated_at,
    lines: rows
      .filter((row) => row.line_index != null)
      .map((row) => ({
        lineIndex: Number(row.line_index),
        purposeKey: row.purpose_key,
        accountCode: row.account_code,
        accountName: row.account_name,
        entryDirection: row.entry_direction,
        amountEur: Number(row.amount_eur),
        taxRate: Number(row.tax_rate),
        memo: row.memo,
        annotation: row.line_annotation,
      })),
  };
}

function mapTelegramMessageTicketRow(row) {
  return {
    id: row.id,
    telegramMessageId: row.telegram_message_id,
    telegramUpdateId: row.telegram_update_id,
    channel: row.channel,
    botKey: row.bot_key,
    telegramChatId: row.telegram_chat_id,
    senderName: row.sender_name,
    senderUsername: row.sender_username,
    messageBody: row.message_body,
    messageType: row.message_type,
    mandantId: row.mandant_id,
    unmatchedMandant: Boolean(row.unmatched_mandant),
    intent: row.intent,
    intentConfidence: Number(row.intent_confidence || 0),
    routeKey: row.route_key,
    routeLabel: row.route_label,
    downstreamPath: row.downstream_path,
    issueTypeLabel: row.issue_type_label,
    assigneeAgentId: row.assignee_agent_id,
    assigneeAgentName: row.assignee_agent_name,
    paperclipIssueId: row.paperclip_issue_id,
    paperclipIssueIdentifier: row.paperclip_issue_identifier,
    submissionId: row.submission_id,
    attachments: JSON.parse(row.attachment_json || "[]"),
    metadata: JSON.parse(row.metadata_json || "{}"),
    rawUpdate: JSON.parse(row.raw_update_json || "{}"),
    processingError: row.processing_error,
    fallbackUsed: Boolean(row.fallback_used),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createSharedBuchungsdatenStore(options = {}) {
  const SQL = await getSqlJs();
  const filePath = options.filePath || DEFAULT_DB_PATH;
  let db;

  try {
    const buffer = await fs.readFile(filePath);
    db = new SQL.Database(new Uint8Array(buffer));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    db = new SQL.Database();
  }

  const store = new SharedBuchungsdatenStore({ SQL, db, filePath });
  store.applySchema();
  store.applyMigrations();
  store.seedAccountCatalog();

  if (options.reseed === true) {
    await store.reseedFromFixtures();
    return store;
  }

  const existingMandanten = Number(queryOne(store.db, "SELECT COUNT(*) AS count FROM mandanten")?.count || 0);
  if (existingMandanten === 0) {
    await store.reseedFromFixtures();
  } else {
    await store.save();
  }

  return store;
}

module.exports = {
  CLIENT_CONTEXT,
  DEFAULT_DB_PATH,
  SUPPORTED_CHART_TYPES,
  createSharedBuchungsdatenStore,
};
