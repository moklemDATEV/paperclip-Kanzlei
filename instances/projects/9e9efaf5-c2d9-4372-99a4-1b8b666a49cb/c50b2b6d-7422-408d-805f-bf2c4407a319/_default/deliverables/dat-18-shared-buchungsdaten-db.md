# DAT-18 Shared Buchungsdaten Database

## Decision

Use an embedded SQLite database backed by `sql.js` and persisted to:

- `showcase/runtime/shared-buchungsdaten.sqlite`

This fits the current workspace because the repo already runs as a small Node server, has no existing package/build system, and does not need an external database service for the onboarding demo.

## Schema

The shared store contains:

- `mandanten`: canonical client master data
- `account_catalog`: explicit `SKR03` and `SKR04` account mappings per business purpose
- `buchungen`: booking headers with status, source reference, and gross/net/VAT totals
- `buchung_lines`: canonical debit/credit lines keyed by `purposeKey`

`buchung_lines` do not hard-code one chart. Instead, reads join against `account_catalog` for the requested chart type so the same booking can be rendered as `SKR03` or `SKR04`.

## Seeded demo data

The database seeds itself from the April 2026 fixtures already present in this workspace:

- `showcase/data/2026-04-bank.csv`
- `showcase/data/supplier-invoices.json`
- `showcase/data/customer-invoices.json`

Seeded records include:

- the Berg & Tal GmbH mandant
- nine representative bookings from the fixture bank statement
- explicit account mappings for both `SKR03` and `SKR04`
- a review-status booking for the Metro transaction

## Access path

Run the existing server:

```bash
npm run serve:showcase
```

Then use:

```text
GET  /api/buchungsdaten/health
GET  /api/buchungsdaten/mandanten
GET  /api/buchungsdaten/account-catalog?chartType=SKR03
GET  /api/buchungsdaten/mandanten/berg-und-tal-eventtechnik-gmbh/buchungen?chartType=SKR04
POST /api/buchungsdaten/mandanten
POST /api/buchungsdaten/mandanten/:mandantId/buchungen
```

## Write contract

Create bookings with canonical line items:

```json
{
  "postingDate": "2026-05-01",
  "counterparty": "Example Supplier GmbH",
  "description": "Example office expense",
  "status": "ready",
  "grossAmountEur": 119,
  "netAmountEur": 100,
  "vatAmountEur": 19,
  "lines": [
    { "purposeKey": "OFFICE_SUPPLIES", "entryDirection": "debit", "amountEur": 100, "taxRate": 19 },
    { "purposeKey": "INPUT_VAT_19", "entryDirection": "debit", "amountEur": 19, "taxRate": 19 },
    { "purposeKey": "BANK", "entryDirection": "credit", "amountEur": 119 }
  ]
}
```

Supported `purposeKey` values are discoverable through `GET /api/buchungsdaten/account-catalog`.

## Scope note

The seeded account mapping is a viable default for the onboarding workspace, not a substitute for tax-office sign-off on a production chart-of-accounts policy.
