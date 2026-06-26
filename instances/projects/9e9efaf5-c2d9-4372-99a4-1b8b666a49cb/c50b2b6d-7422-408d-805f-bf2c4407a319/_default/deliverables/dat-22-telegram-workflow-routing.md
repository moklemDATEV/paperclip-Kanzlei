# DAT-22 Telegram Workflow Routing

## What changed

Mandant Telegram invoice intake now enters the internal processing workflow automatically at the moment the document is ingested.

The runtime now writes a workflow trace for every successful intake under:

- `showcase/runtime/telegram-workflow/`

The trace is also exposed through:

- `GET /api/telegram/mandanten/:mandantId/workflow-runs`

## Routing rule

The downstream path is deterministic and source-linked to the ingested Telegram document:

- `supplier_invoice` or `receipt` without a linked booking -> `bookkeeping:extract_fields` via `bookkeeping_agent`
- `supplier_invoice` or `receipt` with `status=ready` and a linked booking -> `bookkeeping:auto_post` via `bookkeeping_agent`
- `supplier_invoice` or `receipt` with `status=needs_review` -> `bookkeeping:needs_review` via `bookkeeping_agent`
- `customer_invoice` without a linked booking -> `receivables:extract_fields` via `receivables_agent`
- `customer_invoice` with a linked booking -> `receivables:invoice_match` via `receivables_agent`
- `contract` -> `reference:contract_review` via `kanzlei_review_agent`

## Why this is the smallest viable fix

The existing DAT-20 work already normalized Telegram payloads, persisted them, and created linked booking proposals. The missing piece for DAT-22 was the workflow handoff: after intake, there was no durable record showing which downstream processing path now owned the document.

This change keeps the existing intake and persistence model intact and adds only:

- automatic workflow trace creation after intake
- explicit routing metadata per ingested document
- an API read path for operational inspection
- a smoke script proving the Mandant webhook creates that trace end to end

## Verification path

Run:

```bash
npm run telegram:workflow:smoke
```

Expected proof:

- the webhook fixture is accepted
- one Telegram document is persisted
- the workflow trace reports `bookkeeping:extract_fields`
- the trace identifies `bookkeeping_agent` as the downstream owner
