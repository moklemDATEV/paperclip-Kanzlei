#!/usr/bin/env node

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs/promises");
const { createReadStream } = require("node:fs");
const {
  SUPPORTED_CHART_TYPES,
  createSharedBuchungsdatenStore,
} = require("./db/shared-buchungsdaten");

const HOST = process.env.STEUERBERATER_DB_HOST || "0.0.0.0";
const PORT = Number(process.env.STEUERBERATER_DB_PORT || "4182");
const DB_PATH = process.env.STEUERBERATER_DB_FILE || null;
const STATIC_ROOT = path.join(__dirname, "steuerberater-db");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const DOCUMENT_STORAGE_ROOT =
  process.env.DOCUMENT_STORAGE_ROOT || "/home/ubuntu/.paperclip/instances/default/data/storage";
const DOCUMENT_STORAGE_SEARCH_DEPTH = Number(process.env.DOCUMENT_STORAGE_SEARCH_DEPTH || "4");
const documentFileCache = new Map();

function respondJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

async function resolveDocumentFilePath(document) {
  if (!document) {
    return null;
  }

  const candidates = new Set();
  if (document.sourceLink) {
    candidates.add(document.sourceLink);
  }
  if (document.filePath) {
    candidates.add(document.filePath);
  }
  if (document.rawPayload) {
    for (const key of ["sourceStoragePath", "storagePath", "filePath"]) {
      if (document.rawPayload[key]) {
        candidates.add(document.rawPayload[key]);
      }
    }
  }

  for (const candidate of candidates) {
    const absolute = normalizeDocumentCandidatePath(candidate);
    if (!absolute) {
      continue;
    }
    try {
      await fs.stat(absolute);
      return absolute;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (!document.fileName) {
    return null;
  }

  if (documentFileCache.has(document.fileName)) {
    return documentFileCache.get(document.fileName);
  }

  const found = await searchDocumentFile(DOCUMENT_STORAGE_ROOT, document.fileName, DOCUMENT_STORAGE_SEARCH_DEPTH);
  documentFileCache.set(document.fileName, found);
  return found;
}

async function deleteStoredDocumentFileIfUnused(store, document) {
  const filePath = await resolveDocumentFilePath(document);
  if (!filePath) {
    return { deletedStoredFile: false, skippedReason: "file_not_found" };
  }

  if (store.countDocumentsBySourceLink(document.sourceLink) > 1) {
    return { deletedStoredFile: false, skippedReason: "shared_source_link" };
  }

  try {
    await fs.unlink(filePath);
    return { deletedStoredFile: true, deletedFilePath: filePath };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { deletedStoredFile: false, skippedReason: "file_not_found" };
    }
    throw error;
  }
}

function normalizeDocumentCandidatePath(value) {
  if (!value) {
    return null;
  }
  let candidate = String(value).trim();
  if (!candidate) {
    return null;
  }
  if (candidate.startsWith("file://")) {
    candidate = candidate.replace(/^file:\/\//, "");
  }
  if (!path.isAbsolute(candidate)) {
    return null;
  }
  return path.normalize(candidate);
}

async function searchDocumentFile(dir, fileName, depth) {
  if (depth < 0 || !dir) {
    return null;
  }
  try {
    const handle = await fs.opendir(dir);
    for await (const entry of handle) {
      const candidate = path.join(dir, entry.name);
      if (entry.isFile()) {
        if (entry.name === fileName || entry.name.endsWith(`-${fileName}`)) {
          return candidate;
        }
        continue;
      }
      if (entry.isDirectory()) {
        const found = await searchDocumentFile(candidate, fileName, depth - 1);
        if (found) {
          return found;
        }
      }
    }
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      return null;
    }
    throw error;
  }
  return null;
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

async function serveStatic(response, pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const resolvedPath = path.normalize(path.join(STATIC_ROOT, relativePath));
  if (!resolvedPath.startsWith(STATIC_ROOT)) {
    respondJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const stat = await fs.stat(resolvedPath);
    if (stat.isDirectory()) {
      respondJson(response, 404, { error: "Not found" });
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(resolvedPath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(resolvedPath).pipe(response);
  } catch (error) {
    respondJson(response, 404, { error: "Not found" });
  }
}

function toNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be numeric.`);
  }
  return parsed;
}

function toOptionalNumber(value) {
  if (value === "" || value == null) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Numeric field must be numeric.");
  }
  return parsed;
}

function toBoolean(value, fallback = true) {
  if (value == null) {
    return fallback;
  }
  return value === true || value === "true" || value === 1 || value === "1";
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) {
    throw new Error("lines must be an array.");
  }
  return lines.map((line, index) => ({
    lineIndex: toNumber(line.lineIndex ?? index + 1, "lineIndex"),
    purposeKey: line.purposeKey,
    entryDirection: line.entryDirection,
    amountEur: toNumber(line.amountEur, "amountEur"),
    taxRate: line.taxRate == null ? 0 : toNumber(line.taxRate, "taxRate"),
    memo: line.memo || "",
    annotation: line.annotation || null,
  }));
}

function buildErrorStatusCode(error) {
  return /required|must be|Unsupported|not found|balanced|Unknown/i.test(error.message)
    ? 400
    : 500;
}

async function createSteuerberaterDbServer() {
  const store = await createSharedBuchungsdatenStore(DB_PATH ? { filePath: DB_PATH } : {});

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);

    if (pathParts[0] === "api") {
      await store.refreshFromDiskIfChanged();
    }

    if (pathParts[0] === "api" && pathParts[1] === "steuerberater") {
      try {
        const chartType = url.searchParams.get("chartType") || "SKR03";

        if (request.method === "GET" && pathParts[2] === "health" && pathParts.length === 3) {
          respondJson(response, 200, store.getHealth());
          return;
        }

        if (request.method === "GET" && pathParts[2] === "meta" && pathParts.length === 3) {
          respondJson(response, 200, {
            supportedCharts: SUPPORTED_CHART_TYPES,
            purposeKeys: Array.from(
              new Set(store.listAccountCatalog(chartType).map((entry) => entry.purposeKey)),
            ).sort(),
            mandanten: store.listMandanten(),
          });
          return;
        }

        if (request.method === "GET" && pathParts[2] === "mandanten" && pathParts.length === 3) {
          respondJson(response, 200, { mandanten: store.listMandanten() });
          return;
        }

        if (request.method === "POST" && pathParts[2] === "mandanten" && pathParts.length === 3) {
          const payload = await parseJsonBody(request);
          if (!payload.id || !payload.legalName || !payload.displayName || !payload.legalEntity) {
            throw new Error("id, legalName, displayName, and legalEntity are required.");
          }
          store.upsertMandant(payload);
          await store.save();
          respondJson(response, 201, { mandant: store.getMandant(payload.id) });
          return;
        }

        if (request.method === "PUT" && pathParts[2] === "mandanten" && pathParts.length === 4) {
          const payload = await parseJsonBody(request);
          const mandant = store.updateMandant(pathParts[3], payload);
          await store.save();
          respondJson(response, 200, { mandant });
          return;
        }

        if (request.method === "DELETE" && pathParts[2] === "mandanten" && pathParts.length === 4) {
          store.deleteMandant(pathParts[3]);
          await store.save();
          respondJson(response, 200, { deleted: true, id: pathParts[3] });
          return;
        }

        if (request.method === "GET" && pathParts[2] === "account-catalog" && pathParts.length === 3) {
          respondJson(response, 200, {
            chartType,
            accounts: store.listAccountCatalog(url.searchParams.get("chartType") || null),
          });
          return;
        }

        if (request.method === "POST" && pathParts[2] === "account-catalog" && pathParts.length === 3) {
          const payload = await parseJsonBody(request);
          const account = store.createAccountCatalogEntry({
            chartType: payload.chartType,
            purposeKey: payload.purposeKey,
            accountCode: payload.accountCode,
            accountName: payload.accountName,
            category: payload.category,
            taxRate: toOptionalNumber(payload.taxRate) ?? 0,
            isActive: toBoolean(payload.isActive, true),
          });
          await store.save();
          respondJson(response, 201, { account });
          return;
        }

        if (
          request.method === "PUT" &&
          pathParts[2] === "account-catalog" &&
          pathParts.length === 4
        ) {
          const payload = await parseJsonBody(request);
          const account = store.updateAccountCatalogEntry(Number(pathParts[3]), {
            chartType: payload.chartType,
            purposeKey: payload.purposeKey,
            accountCode: payload.accountCode,
            accountName: payload.accountName,
            category: payload.category,
            taxRate: payload.taxRate == null ? undefined : toNumber(payload.taxRate, "taxRate"),
            isActive: payload.isActive == null ? undefined : toBoolean(payload.isActive, true),
          });
          await store.save();
          respondJson(response, 200, { account });
          return;
        }

        if (
          request.method === "DELETE" &&
          pathParts[2] === "account-catalog" &&
          pathParts.length === 4
        ) {
          store.deleteAccountCatalogEntry(Number(pathParts[3]));
          await store.save();
          respondJson(response, 200, { deleted: true, id: Number(pathParts[3]) });
          return;
        }

        if (request.method === "GET" && pathParts[2] === "buchungen" && pathParts.length === 3) {
          respondJson(response, 200, {
            chartType,
            buchungen: store.listAllBookings(chartType, {
              mandantId: url.searchParams.get("mandantId") || null,
            }),
          });
          return;
        }

        if (request.method === "POST" && pathParts[2] === "buchungen" && pathParts.length === 3) {
          const payload = await parseJsonBody(request);
          const booking = store.createBooking({
            id: payload.id || undefined,
            mandantId: payload.mandantId,
            sourceType: payload.sourceType,
            sourceReference: payload.sourceReference,
            postingDate: payload.postingDate,
            counterparty: payload.counterparty,
            description: payload.description,
            status: payload.status,
            grossAmountEur: payload.grossAmountEur == null ? undefined : toNumber(payload.grossAmountEur, "grossAmountEur"),
            netAmountEur: payload.netAmountEur == null ? undefined : toNumber(payload.netAmountEur, "netAmountEur"),
            vatAmountEur: payload.vatAmountEur == null ? undefined : toNumber(payload.vatAmountEur, "vatAmountEur"),
            annotation: payload.annotation || null,
            currency: payload.currency || "EUR",
            lines: normalizeLines(payload.lines),
          });
          await store.save();
          respondJson(response, 201, { booking });
          return;
        }

        if (request.method === "PUT" && pathParts[2] === "buchungen" && pathParts.length === 4) {
          const payload = await parseJsonBody(request);
          const booking = store.updateBooking(
            pathParts[3],
            {
              mandantId: payload.mandantId,
              sourceType: payload.sourceType,
              sourceReference: payload.sourceReference,
              postingDate: payload.postingDate,
              counterparty: payload.counterparty,
              description: payload.description,
              status: payload.status,
              grossAmountEur:
                payload.grossAmountEur == null
                  ? undefined
                  : toNumber(payload.grossAmountEur, "grossAmountEur"),
              netAmountEur:
                payload.netAmountEur == null ? undefined : toNumber(payload.netAmountEur, "netAmountEur"),
              vatAmountEur:
                payload.vatAmountEur == null ? undefined : toNumber(payload.vatAmountEur, "vatAmountEur"),
              annotation: payload.annotation,
              currency: payload.currency,
            },
            {
              chartType,
              changedBy: payload.changedBy || "steuerberater-db-ui",
              changeReason: payload.changeReason || null,
            },
          );
          await store.save();
          respondJson(response, 200, { booking });
          return;
        }

        if (request.method === "DELETE" && pathParts[2] === "buchungen" && pathParts.length === 4) {
          store.deleteBooking(pathParts[3]);
          await store.save();
          respondJson(response, 200, { deleted: true, id: pathParts[3] });
          return;
        }

        if (request.method === "GET" && pathParts[2] === "buchung-lines" && pathParts.length === 3) {
          respondJson(response, 200, {
            chartType,
            buchungLines: store.listBookingLines(chartType, {
              buchungId: url.searchParams.get("buchungId") || null,
            }),
          });
          return;
        }

        if (request.method === "POST" && pathParts[2] === "buchung-lines" && pathParts.length === 3) {
          const payload = await parseJsonBody(request);
          const line = store.createBookingLine({
            buchungId: payload.buchungId,
            lineIndex: toNumber(payload.lineIndex, "lineIndex"),
            purposeKey: payload.purposeKey,
            entryDirection: payload.entryDirection,
            amountEur: toNumber(payload.amountEur, "amountEur"),
            taxRate: payload.taxRate == null ? 0 : toNumber(payload.taxRate, "taxRate"),
            memo: payload.memo,
            annotation: payload.annotation,
          });
          await store.save();
          respondJson(response, 201, { line });
          return;
        }

        if (request.method === "PUT" && pathParts[2] === "buchung-lines" && pathParts.length === 4) {
          const payload = await parseJsonBody(request);
          const line = store.updateBookingLine(
            Number(pathParts[3]),
            {
              lineIndex: payload.lineIndex == null ? undefined : toNumber(payload.lineIndex, "lineIndex"),
              purposeKey: payload.purposeKey,
              entryDirection: payload.entryDirection,
              amountEur: payload.amountEur == null ? undefined : toNumber(payload.amountEur, "amountEur"),
              taxRate: payload.taxRate == null ? undefined : toNumber(payload.taxRate, "taxRate"),
              memo: payload.memo,
              annotation: payload.annotation,
            },
            {
              chartType,
              changedBy: payload.changedBy || "steuerberater-db-ui",
              changeReason: payload.changeReason || null,
            },
          );
          await store.save();
          respondJson(response, 200, { line });
          return;
        }

        if (
          request.method === "DELETE" &&
          pathParts[2] === "buchung-lines" &&
          pathParts.length === 4
        ) {
          store.deleteBookingLine(Number(pathParts[3]));
          await store.save();
          respondJson(response, 200, { deleted: true, id: Number(pathParts[3]) });
          return;
        }

        if (request.method === "GET" && pathParts[2] === "changelog" && pathParts.length === 3) {
          respondJson(response, 200, {
            entries: store.listBuchungenChangelog({
              buchungId: url.searchParams.get("buchungId") || null,
              buchungLineId: url.searchParams.get("buchungLineId") || null,
              limit: url.searchParams.get("limit") || 200,
            }),
          });
          return;
        }

        respondJson(response, 404, { error: "Steuerberater DB endpoint not found." });
        return;
      } catch (error) {
        respondJson(response, buildErrorStatusCode(error), { error: error.message });
        return;
      }
    }

    if (pathParts[0] === "api" && pathParts[1] === "data") {
      try {
        if (request.method === "GET" && pathParts[2] === "documents" && pathParts.length === 3) {
          respondJson(response, 200, { documents: store.listDocuments() });
          return;
        }

        if (
          request.method === "GET" &&
          pathParts[2] === "documents" &&
          pathParts.length === 5 &&
          pathParts[4] === "file"
        ) {
          const document = store.getDocumentById(pathParts[3]);
          if (!document) {
            respondJson(response, 404, { error: "Document not found." });
            return;
          }

          const filePath = await resolveDocumentFilePath(document);
          if (!filePath) {
            respondJson(response, 404, { error: "Document file not found." });
            return;
          }

          const fileName = document.fileName || path.basename(filePath);
          const sanitizedFileName = fileName.replace(/"/g, "");
          response.writeHead(200, {
            "Content-Type": document.mimeType || "application/octet-stream",
            "Content-Disposition": `inline; filename="${sanitizedFileName}"`,
            "Cache-Control": "no-store",
          });

          const stream = createReadStream(filePath);
          stream.once("error", (error) => {
            response.destroy(error);
          });
          stream.pipe(response);
          return;
        }

        if (
          request.method === "PUT" &&
          pathParts[2] === "documents" &&
          pathParts.length === 4
        ) {
          const payload = await parseJsonBody(request);
          const document = store.updateTelegramDocument(pathParts[3], {
            fileName: payload.fileName,
            mimeType: payload.mimeType,
            documentType: payload.documentType,
            direction: payload.direction,
            counterparty: payload.counterparty,
            documentDate: payload.documentDate,
            servicePeriodStart: payload.servicePeriodStart,
            servicePeriodEnd: payload.servicePeriodEnd,
            description: payload.description,
            status: payload.status,
            confidence: payload.confidence,
            currency: payload.currency,
            vatRate: toOptionalNumber(payload.vatRate) ?? 0,
            grossAmountEur: toOptionalNumber(payload.grossAmountEur),
            netAmountEur: toOptionalNumber(payload.netAmountEur),
            vatAmountEur: toOptionalNumber(payload.vatAmountEur),
            purposeKey: payload.purposeKey,
            sourceLink: payload.sourceLink,
            linkedBookingId: payload.linkedBookingId,
          });
          await store.save();
          respondJson(response, 200, { document });
          return;
        }

        if (
          request.method === "DELETE" &&
          pathParts[2] === "documents" &&
          pathParts.length === 4
        ) {
          const document = store.getDocumentById(pathParts[3]);
          if (!document) {
            respondJson(response, 404, { error: "Document not found." });
            return;
          }

          const deleteStoredFile = toBoolean(url.searchParams.get("deleteStoredFile"), true);
          let fileDeletion = { deletedStoredFile: false, skippedReason: "not_requested" };
          if (deleteStoredFile) {
            fileDeletion = await deleteStoredDocumentFileIfUnused(store, document);
          }

          const deleted = store.deleteTelegramDocument(pathParts[3]);
          await store.save();
          respondJson(response, 200, { deleted: true, document: deleted, ...fileDeletion });
          return;
        }

        respondJson(response, 404, { error: "Data endpoint not found." });
        return;
      } catch (error) {
        respondJson(response, buildErrorStatusCode(error), { error: error.message });
        return;
      }
    }

    if (request.method === "GET") {
      await serveStatic(response, url.pathname);
      return;
    }

    respondJson(response, 405, { error: "Method not allowed." });
  });

  return { server, store };
}

async function startServer() {
  const { server } = await createSteuerberaterDbServer();
  await new Promise((resolve) => {
    server.listen(PORT, HOST, resolve);
  });
  console.log(`Steuerberater DB frontend listening on http://${HOST}:${PORT}`);
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  createSteuerberaterDbServer,
  startServer,
};
