# DAT-24 Telegram Routing And Ticket Creation

`DAT-24` implements the approved DAT-23 Telegram routing model on top of the shared DAT SQLite store.

## What changed

- Added a message-level Telegram routing table with the approved assignee map:
  - `mandant` channel -> `Mandant Intake` / `internal_intake`
  - `@docs`, `@reco`, `@tax`, `@compliance`, `@review`, `@outbound`, `@cto`
  - Kanzlei fallback -> `CEO` / `triage`
- Added idempotent `telegram_message_tickets` persistence keyed by `telegram_message_id`.
- Added `telegram_ticket_audit_events` for route selection, issue creation, fallback, and outbound-release evidence.
- Added `telegram_outbound_approvals` so client replies stay blocked until both `Compliance Guard` and `Steuerberater Review Copilot` approvals are recorded.
- Changed Mandant webhooks to stop replying directly to the client bot. The webhook now creates one `Mandant Intake` ticket, persists document intake artifacts when a document or photo is present, and immediately creates the DAT-22 downstream workflow issues as children of that intake ticket.
- Added CEO fallback ticket creation when issue routing/creation fails.

## Verification

Executed:

```bash
npm run telegram:routing:smoke
npm run telegram:paperclip:smoke
npm run telegram:workflow:smoke
```

Coverage from `telegram:routing:smoke`:

- every DAT-23 route
- duplicate suppression on repeated `telegram_message_id`
- CEO fallback ticket creation after a forced routing failure
- outbound gating before and after approvals
- audit events for receive, route, assignment, and fallback

## Current PoC limits

- Intent recognition is keyword-based rather than model-based.
- Tolerant `mandant_id` matching uses local name heuristics from the existing shared database.
- The bot webhook path now creates both routing tickets and the DAT-22 document-workflow handoff for Mandant uploads; `/api/telegram/intake` still remains available as a local showcase entry point for the same workflow artifact path.
