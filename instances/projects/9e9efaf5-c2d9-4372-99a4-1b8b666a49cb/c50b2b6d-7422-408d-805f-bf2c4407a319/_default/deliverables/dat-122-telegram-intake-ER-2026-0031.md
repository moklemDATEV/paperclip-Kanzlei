# DAT-122 Telegram Mandant Intake – ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf

## Structured case brief (intake normalization)
- **Mandant / client**: Berg & Tal Eventtechnik GmbH (`berg-und-tal-eventtechnik-gmbh`, DATEV bookkeeping standard monthly bundle).
- **Channel / ticket**: Mandant Telegram bot (`@Mandat_Paper_bot`), `internal_intake` route, Telegram chat `8695197922`, message `54`; sender Moritz, intent `mandant_default`.
- **Document**: `ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf` (Document ID `1a98283d-f3fe-430e-aefe-1258e690e539`, Submission ID `1283fc57-7fdf-4383-9b28-b0850bbad143`).
- **Status**: Document ingestion flagged this extraction as `ready_for_downstream_handoff` and the workflow trace now recommends Bookkeeping Reconciliation as the next owner.
- **Source link**: `showcase/runtime/telegram-files/BQACAgIAAxkBAAM2ajKg_x56opBw1Nay7t1gi3MoDU8AAr6ZAALGnpFJuhOx4pfjewo8BA/ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf` (sha256 `fd0408bc27ff864dcaf74b2c26c8551cab1ad6d0948fcbfa79b6a8a42295e867`).

## Key metadata & extracted fields
- **Document type**: Supplier invoice / Eingangsrechnung, direction `incoming_expense`, workflow tag `receipt` (source classification high confidence).
- **Invoice number**: `BM-2026-8834` (DATEV sheet field "Orig. Rechnungsnr").
- **Invoice date**: `2026-05-16`.
- **Service period**: `2026-05-01` to `2026-05-31` ("Leistungszeitraum: Mai 2026" interpreted as the full month).
- **Supplier**: Büro & Mehr GmbH · Kufsteiner Str. 45 · 83022 Rosenheim (VAT ID not printed on the sheet).
- **Currency**: EUR.
- **Amounts**: Net €148.00, VAT €28.12 (19 %), Gross €176.12 (booked in the same proportions as the DATEV proposal).
- **Booking period assumption**: May 2026 (FiBu-Laufzeit 2026, Buchungsmonat gemäß Rechnungsdatum).

## Booking proposal (SKR03)
| Account | Direction | Amount (EUR) | Memo / evidence |
| --- | --- | --- | --- |
| `4780` Bürobedarf | Debit (Soll) | 148.00 | DATEV Buchungsvorschlag line "Soll 4780 Bürobedarf 148,00 EUR".
| `1576` Abziehbare Vorsteuer 19 % | Debit (Soll) | 28.12 | DATEV line "Soll 1576 Abziehbare Vorsteuer 19 % 28,12 EUR".
| `70200` Kreditor Büro & Mehr GmbH | Credit (Haben) | 176.12 | DATEV line "Haben 70200 Kreditor Büro & Mehr GmbH 176,12 EUR".

**Purpose key**: `BUEROBEDARF`; **Chart**: `SKR03`; **Routing**: downstream handoff flagged for Bookkeeping Reconciliation Agent.

## Anomalies & verification notes
- **Anomaly code**: `summary_sheet_without_original_invoice` (severity medium). The ingested file is a DATEV Aufbereitungsbogen — it references the supplier invoice but the original PDF is not part of this upload.
- **Impact**: IBAN/BIC, payment reference, payment terms, and supplier USt-IdNr. cannot be confirmed from this sheet alone. Bookkeeping should cross-check the original invoice in the Kanzlei DMS if payment reconciliation or SEPA-Batch uploads require those details.
- **Recommendation**: If the downstream posting or payment reconciliation task finds any discrepancy (amount, missing IBAN, wrong creditor account), request the original invoice via Client Communication instead of guessing the missing fields from the summary sheet.

## Downstream handoff
- **Next owner**: Bookkeeping Reconciliation Agent (per `downstreamHandoff.recommendedNextOwner`).
- **Handoff notes**:
  1. Treat this extraction as the canonical DATEV booking proposal for ER-2026-0031 (Bürobedarf Büro & Mehr GmbH).
  2. Use the three SKR03 lines above as the posting template (net + VAT + creditor) when matching payments or posting to the ledger.
  3. If payment reconciliation flags a discrepancy, go back to the Kanzlei DMS and/or the Mandant for the original supplier invoice instead of inventing missing data.
- **Document ingestion trace**: see `deliverables/dat-110-telegram-intake-ER-2026-0031-extraction.json` for the full structured extraction, submitted metadata, and workflow routing artifact.

## Artifact references
- PDF stored in the runtime: `/showcase/runtime/telegram-files/BQACAgIAAxkBAAM2ajKg_x56opBw1Nay7t1gi3MoDU8AAr6ZAALGnpFJuhOx4pfjewo8BA/ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf` (sha256 `fd0408bc27ff864dcaf74b2c26c8551cab1ad6d0948fcbfa79b6a8a42295e867`).
- Canonical extraction / booking JSON: `deliverables/dat-110-telegram-intake-ER-2026-0031-extraction.json`.
- Intake submission identifiers: submission `1283fc57-7fdf-4383-9b28-b0850bbad143`, document `1a98283d-f3fe-430e-aefe-1258e690e539`.
