# DAT-20 Telegram Intake and Accounting Extraction

## What shipped

`DAT-20` adds a Telegram-style document intake path on top of the existing shared Buchungsdaten database and showcase server.

The implementation now supports:

- Telegram submission records with sender/chat metadata
- source-linked document persistence for invoices, receipts, and contracts
- extracted accounting fields stored in the database
- automatic booking proposals that resolve to `SKR03` or `SKR04`
- DAT-6 bot-specific pipeline wiring for the Mandant and Kanzlei channels

## API surface

Run the showcase server:

```bash
npm run serve:showcase
```

Then use:

```text
POST /api/telegram/intake?chartType=SKR03|SKR04
GET  /api/telegram/mandanten/:mandantId/submissions
GET  /api/telegram/mandanten/:mandantId/documents?chartType=SKR03|SKR04
GET  /api/telegram/bots/status
POST /api/telegram/bots/mandant/webhook?chartType=SKR03|SKR04
POST /api/telegram/bots/kanzlei/webhook?chartType=SKR03|SKR04
```

## Persistence model

The database now includes:

- `telegram_submissions`: one row per Telegram delivery
- `telegram_documents`: one row per uploaded document with extracted fields, status, and optional `linked_booking_id`

Document rows preserve:

- Telegram chat/message/file identifiers
- file name and mime type
- classification (`supplier_invoice`, `customer_invoice`, `receipt`, `contract`)
- extracted amount/date/counterparty fields
- `purposeKey` used for downstream booking
- raw payload and extracted metadata JSON

## Booking mapping

Bookings continue to use canonical `purposeKey` lines and chart-specific reads.

New mapping added:

- `TRADE_PAYABLES`

Telegram intake creates:

- supplier invoices and receipts -> expense + input VAT + `TRADE_PAYABLES`
- customer invoices -> `TRADE_RECEIVABLES` + revenue + output VAT
- contracts -> persisted as `reference_only` documents with no immediate booking

That keeps one source-linked intake table while still producing booking records that can be read as either `SKR03` or `SKR04`.

## DAT-6 bot mapping

The real `DAT-6` bots are now wired to concrete server-side paths:

- `@Mandat_Paper_bot`
  Mandant-facing intake bot. Accepts incoming Telegram documents/photos and runs them through the intake extraction pipeline.
- `@Kanzlei_Paper_Bot`
  Kanzlei/reviewer bot. Accepts reviewer commands and returns the current Telegram review queue or the latest submission summary.

The runtime loads bot tokens and non-secret channel metadata from the approved host file:

- `/home/ubuntu/.paperclip-secrets/DAT-10-telegram.env`

No token values are stored in repo files or issue comments.

## Activation path

Verify the Telegram bot credentials and current webhook state:

```bash
npm run telegram:bots:verify
```

Register the live webhook URLs once a public HTTPS showcase URL is available:

```bash
SHOWCASE_PUBLIC_URL=https://your-public-host.example.com npm run telegram:bots:register
```

The registration helper also uploads `/etc/ssl/certs/paperclip.crt` when present, which allows Telegram to trust the currently deployed self-signed nginx certificate for this workspace.

## Demo fixture and verification path

Fixture:

- `showcase/data/telegram-intake-demo.json`

Runner:

```bash
npm run telegram:intake:demo
```

The fixture covers:

- Amazon supplier invoice
- Metro receipt held for review
- Telekom contract captured for reference
- Eventhaus customer invoice posted to receivables

After running the demo, reviewers can inspect:

- `GET /api/buchungsdaten/health`
- `GET /api/telegram/mandanten/berg-und-tal-eventtechnik-gmbh/submissions`
- `GET /api/telegram/mandanten/berg-und-tal-eventtechnik-gmbh/documents?chartType=SKR03`
- `GET /api/telegram/mandanten/berg-und-tal-eventtechnik-gmbh/documents?chartType=SKR04`

For local dry-run bot verification, also use:

- `GET /api/telegram/bots/status`
- `POST /api/telegram/bots/mandant/webhook?chartType=SKR03`
- `POST /api/telegram/bots/kanzlei/webhook?chartType=SKR04`
