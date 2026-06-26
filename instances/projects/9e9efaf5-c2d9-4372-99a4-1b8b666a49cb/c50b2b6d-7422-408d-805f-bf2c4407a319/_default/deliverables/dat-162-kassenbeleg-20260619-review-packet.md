# DAT-162 Reviewer Packet – Kassenbeleg_20260619.pdf

## Review boundary
- This packet is for human Steuerberater review only.
- It is not filing approval, final tax advice, or client-facing authorization.

## Open risks requiring reviewer attention
- **Duplicate revenue risk:** the source is a cash receipt, but the packet does not prove whether a separate invoice was also issued for the same 2026-06-19 service.
- **Formal compliance scope:** the workflow proves source retention, ledger linkage, and draft VAT treatment, but it does not prove whether any additional cash-register or archival formalities are required for this fact pattern.
- **Workflow defect visibility:** DAT-159 remains open because the Telegram route first treated this as an expense-side receipt before downstream correction. The booking result appears corrected, but the defect should stay visible.

## Proposed treatment to review
- **Document:** `Kassenbeleg_20260619.pdf`
- **Mandant:** Berg-und-Tal-Eventtechnik GmbH, Mandant 58734
- **Customer / payer:** Stadtwerke Rosenheim GmbH & Co. KG, customer no. `KD-00291`, DATEV debtor `10291`
- **Document date / service date / posting date:** `2026-06-19`
- **Payment method:** cash
- **Amounts:** net `210.00 EUR`, VAT `39.90 EUR`, gross `249.90 EUR`
- **Draft booking basis:** debit `1000 Kasse 249.90`, credit `8400 Erlöse 19 % USt 210.00`, credit `1776 Umsatzsteuer 19 % 39.90`
- **Draft VAT treatment:** include in the June 2026 VAT draft as domestic 19% output revenue with `39.90 EUR` output VAT
- **Draft bookkeeping posture:** no further booking change proposed because DAT-156 already linked the source document to booking `dat-156-kassenbeleg-20260619-cash-revenue`

## Reviewer decision points
1. Confirm whether this cash receipt is the operative sales document, or whether a separate invoice exists that could create duplicate revenue recognition.
2. Confirm whether the printed domestic `19 %` VAT treatment is appropriate for the underlying service and no special regime overrides apply.
3. Confirm whether the retained PDF, source linkage, and posted ledger entry are sufficient for this MVP workflow, or whether additional Kassen-/Archiv controls must be evidenced before any downstream use.

## Evidence map
- **Primary source PDF:** `showcase/runtime/telegram-files/BQACAgIAAxkBAANTajULs2ZAIS1werybrxaxSrBvP2UAAjWfAALZ7ahJQiiQPuSv6zg8BA/Kassenbeleg_20260619.pdf`
- **Source integrity:** SHA-256 `6f784f3f1e708f1035ec9bc9bfafbd8497daf35f4751659ff8f54c836eb8d522`
- **Direct source facts confirmed from PDF text:** receipt header `KASSENBELEG`, receipt no. `Kassenbeleg_20260619`, date `19.06.2026`, cash received `249,90 EUR`, customer `Stadtwerke Rosenheim GmbH & Co. KG`, and DATEV posting block `1000/8400/1776`
- **Structured extraction:** `deliverables/dat-152-kassenbeleg-20260619-extraction.json`
- **Ledger reconciliation:** `deliverables/dat-156-kassenbeleg-20260619-reconciliation.json`
- **Draft tax treatment:** `deliverables/dat-160-kassenbeleg-20260619-tax-draft.json`
- **Compliance gate:** `deliverables/dat-161-kassenbeleg-20260619-compliance-review.json`

## What changed through the workflow
- DAT-152 classified the PDF as a mandant-issued cash revenue receipt and extracted the customer, service, amount, and DATEV booking details.
- DAT-156 linked the receipt to shared-ledger booking `dat-156-kassenbeleg-20260619-cash-revenue` and verified period/date consistency for June 2026.
- DAT-160 converted that reconciled posting into a draft-only VAT/output-tax treatment with explicit assumptions.
- DAT-161 allowed reviewer handoff but kept the package non-filing-ready and preserved the open assumptions for human review.

## Reviewer-ready conclusion
- The packet is inspectable and source-traceable enough for a human Steuerberater to approve or reject the proposed treatment quickly.
- The packet is **not** sufficient to imply final approval on its own because the duplicate-revenue question and formal compliance scope still require human judgment.
