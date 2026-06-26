# DAT-16 Live Showcase

This folder contains a runnable live showcase for the Steuerkanzlei workflow.

## Open the showcase

Run:

```bash
./scripts/serve-showcase.sh
```

Then open `http://127.0.0.1:4173`.

## What to click

1. Click `Run live April 2026 flow`.
2. Wait for the three agent steps to finish.
3. Review the `Intake`, `Review & Extraction`, and `Monthly Package` screens.
4. Open `Runtime Trace` to inspect agent response IDs, durations, and the persisted runtime artifact.

## Live source files

- `data/2026-04-bank.csv` is the concrete bank export fixture used for matching.
- `data/supplier-invoices.json` and `data/customer-invoices.json` are the representative invoice extracts used by the live run.
- `data/sales-summary-april.json` is included as a cross-check input only.

## Runtime artifacts

- Each live run writes `runtime/latest-run.json`.
- The UI also links the timestamped artifact for the specific run that just completed.

## Scope note

This live demo is intentionally narrower than the DAT-15 static prototype. The runtime totals now come from the source files that exist in this workspace, and the UI labels that scope explicitly instead of pretending to cover a broader monthly packet.

## Shared Buchungsdaten database

This workspace now includes a local embedded SQLite database at `showcase/runtime/shared-buchungsdaten.sqlite`.

Initialize or reseed it from the April 2026 fixtures:

```bash
npm run db:seed
```

Inspect the seeded data:

```bash
npm run db:inspect -- SKR03
npm run db:inspect -- SKR04
```

The existing server exposes the shared access path for other agents/services:

- `GET /api/buchungsdaten/health`
- `GET /api/buchungsdaten/mandanten`
- `GET /api/buchungsdaten/account-catalog?chartType=SKR03|SKR04`
- `GET /api/buchungsdaten/mandanten/:mandantId/buchungen?chartType=SKR03|SKR04`
- `POST /api/buchungsdaten/mandanten`
- `POST /api/buchungsdaten/mandanten/:mandantId/buchungen`

Bookings are stored once with canonical `purposeKey` line items and resolved to either `SKR03` or `SKR04` on read. That keeps one shared data store while making chart-specific account codes explicit at query time.

## Telegram document intake

The workspace now also exposes a Telegram-style intake path that persists source-linked document extracts into the same database:

- `POST /api/telegram/intake?chartType=SKR03|SKR04`
- `GET /api/telegram/mandanten/:mandantId/workflow-runs`
- `GET /api/telegram/mandanten/:mandantId/submissions`
- `GET /api/telegram/mandanten/:mandantId/documents?chartType=SKR03|SKR04`
- `GET /api/telegram/bots/status`
- `POST /api/telegram/bots/mandant/webhook?chartType=SKR03|SKR04`
- `POST /api/telegram/bots/kanzlei/webhook?chartType=SKR03|SKR04`

The intake route accepts either:

- a demo payload shaped like `{ mandantId, telegramChatId, senderName, documents: [...] }`
- a Telegram webhook payload shaped like `{ mandantId, message: { document: ... } }`

Each ingested document is stored with Telegram source metadata, classification, extracted accounting fields, and an optional linked booking. Supplier invoices and receipts create open-payable bookings. Customer invoices create open-receivable bookings. Contracts are stored as structured reference documents without an immediate booking.

DAT-22 adds the workflow handoff on top of persistence. Every successful Mandant intake now writes a source-linked workflow trace under `showcase/runtime/telegram-workflow/` and prepares each document for a downstream path:

- supplier invoices and receipts without a linked booking -> `bookkeeping:extract_fields`
- ready supplier invoices and receipts with a linked booking -> `bookkeeping:auto_post`
- supplier-side `needs_review` documents -> `bookkeeping:needs_review`
- customer invoices without a linked booking -> `receivables:extract_fields`
- customer invoices with a linked booking -> `receivables:invoice_match`
- contracts -> `reference:contract_review`

When Paperclip runtime credentials are configured, the Telegram webhook creates the Mandant Intake issue immediately, persists the downstream workflow plan, and patches the intake ticket with the pending route plus `sourceLink`/`documentId` details. The downstream workflow issue is created only after Mandant Intake explicitly finishes and runs `node showcase/scripts/handoff-telegram-intake-issue.js`, which prevents Mandant Intake and Document Ingestion from racing in parallel on the same upload.

Downstream workflow owners now get the same deterministic escape hatch: workflow issue descriptions include `node showcase/scripts/handoff-paperclip-workflow-issue.js`, which creates the next Paperclip issue for the requested owner, carries the upstream context forward, and closes the current issue in one step.

Owner resolution now uses an explicit logical-role routing map. The code first checks configured `SHOWCASE_PAPERCLIP_*_AGENT_ID` overrides and otherwise resolves the known logical roles (`Document Ingestion`, `Bookkeeping Reconciliation`, `Client Communication`, `Tax Preparation`, etc.) from the cached Paperclip agent directory by exact role name / urlKey. If a requested next owner is missing from that map, the current issue is marked `blocked` instead of creating an unassigned downstream issue.

Inside a live Paperclip heartbeat, the activation layer can still inherit the current Paperclip context, but that fallback is now opt-in via `SHOWCASE_PAPERCLIP_ALLOW_HEARTBEAT_CONTEXT=1`. The long-lived webhook should run with explicit `SHOWCASE_PAPERCLIP_*` values instead of ambient heartbeat credentials.

Supported default mappings:

- extraction routes -> `Document Ingestion`
- bookkeeping/reconciliation routes -> `Bookkeeping Reconciliation`
- contract review routes -> `Steuerberater Review Copilot`

Run the included demo fixture:

```bash
npm run telegram:intake:demo
```

The demo payload lives at `showcase/data/telegram-intake-demo.json` and covers:

- a supplier invoice
- a receipt that stays `needs_review`
- a contract captured as `reference_only`
- a customer invoice mapped into receivables

## DAT-6 bot wiring

The approved `DAT-6` Telegram bots are now mapped into concrete pipelines:

- `@Mandat_Paper_bot` -> Mandant intake webhook -> one `Mandant Intake` Paperclip ticket per inbound message, optional document persistence, immediate receipt acknowledgement
- `@Kanzlei_Paper_Bot` -> Kanzlei routing webhook -> explicit mention first, then intent recognition, then CEO fallback

Runtime configuration is loaded from the approved host secret file:

- `/home/ubuntu/.paperclip-secrets/DAT-10-telegram.env`

Verify the configured bots without echoing token values:

```bash
npm run telegram:bots:verify
```

Register the webhook URLs after setting a public HTTPS base URL:

```bash
SHOWCASE_PUBLIC_URL=https://your-public-host.example.com npm run telegram:bots:register
```

If the host uses the bundled self-signed nginx certificate at `/etc/ssl/certs/paperclip.crt`, the registration helper now uploads that certificate to Telegram automatically so webhook verification can succeed.

Dry-run the wired pipelines locally without sending Telegram replies:

```bash
TELEGRAM_DISABLE_SEND=1 SHOWCASE_PORT=4181 npm run serve:showcase
curl -sS -X POST 'http://127.0.0.1:4181/api/telegram/bots/mandant/webhook?chartType=SKR03' -H 'Content-Type: application/json' --data @showcase/data/telegram-mandant-webhook.json
curl -sS -X POST 'http://127.0.0.1:4181/api/telegram/bots/kanzlei/webhook?chartType=SKR04' -H 'Content-Type: application/json' --data @showcase/data/telegram-kanzlei-webhook.json
```

The DAT-24 webhook path creates one Paperclip intake ticket per inbound Telegram message and stores an audit trail plus idempotency record in the shared SQLite database. For Mandant document uploads it sends a short receipt acknowledgement, writes the DAT-22 workflow trace, and patches the intake issue with the pending downstream route plus `sourceLink`/`documentId` details. The downstream workflow issue is not created until Mandant Intake has completed the brief and explicitly hands the file off, which prevents Mandant Intake and Document Ingestion from racing in parallel on the same upload. Kanzlei traffic resolves via the approved DAT-23 route table. Client-facing Telegram replies beyond the receipt acknowledgement are blocked until the ticket is owned by `Client Communication` and both `Compliance Guard` and `Steuerberater Review Copilot` approvals are recorded.

Paperclip activation for the long-lived showcase webhook must be configured with explicit `SHOWCASE_PAPERCLIP_API_URL`, `SHOWCASE_PAPERCLIP_API_KEY`, and `SHOWCASE_PAPERCLIP_COMPANY_ID` values. Ambient `PAPERCLIP_*` heartbeat credentials are ignored by default for the running webhook server; set `SHOWCASE_PAPERCLIP_ALLOW_HEARTBEAT_CONTEXT=1` only for short-lived heartbeat-driven experiments.

Mock the Paperclip activation path locally:

```bash
npm run telegram:paperclip:smoke
```

Run the full DAT-24 routing coverage harness locally:

```bash
npm run telegram:routing:smoke
```

## DAT-35 Steuerberater DB frontend

This workspace now includes a dedicated CRUD frontend for the shared SQLite bookkeeping database.
It runs as a separate Node service so it does not interfere with the live showcase server.

Start it in the foreground:

```bash
npm run serve:steuerberater-db
```

Deploy it in the background on the EC2 instance:

```bash
npm run deploy:steuerberater-db
```

Default runtime:

- host: `0.0.0.0`
- port: `4182`
- public HTTPS path via nginx: `https://13.49.175.198/steuerberater-db/`
- log file: `showcase/runtime/steuerberater-db.log`
- pid file: `showcase/runtime/steuerberater-db.pid`

The host certificate is self-signed, so browsers will show a certificate warning until the cert is trusted locally.

Available CRUD tables:

- `mandanten`
- `account_catalog`
- `buchungen`
- `buchung_lines`

Additional operator endpoints:

- `GET /api/steuerberater/health`
- `GET /api/steuerberater/meta?chartType=SKR03|SKR04`
- `GET /api/steuerberater/changelog?limit=50`

The storage layer now applies the required DAT-35 migrations automatically:

- adds `annotation` to `buchungen`
- adds `annotation` to `buchung_lines`
- creates `buchungen_changelog`

On every update to `buchungen` or `buchung_lines`, the server writes changelog rows before applying the SQL `UPDATE`.

Run the focused smoke test:

```bash
npm run steuerberater-db:smoke
```
