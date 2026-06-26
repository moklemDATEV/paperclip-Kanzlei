# DAT-138 – Mandant Intake Brief

## 1. Client / Entity
- Mandant name: Berg-und-Tal-Eventtechnik GmbH
- Mandant identifier: berg-und-tal-eventtechnik-gmbh (from ticket metadata)
- Contact / channel: Telegram (`telegram_chat_id`: 8695197922, sender: Moritz)

## 2. Document & Requested Service
- Channel: Telegram intake – mandant internal intake
- Document type (from intake contract): Eingangsrechnung / supplier invoice
- File received: `ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf`
- Source / storage:
  - Paperclip attachment id: 7a9cf465-cac5-409c-a466-87727aaf2334
  - Workflow sourceLink: `/home/ubuntu/.paperclip/instances/default/projects/9e9efaf5-c2d9-4372-99a4-1b8b666a49cb/c50b2b6d-7422-408d-805f-bf2c4407a319/_default/showcase/runtime/telegram-files/BQACAgIAAxkBAANNajOp2Pc-svSRb3wBS_9PhAfzzLIAAjKTAALGnplJ-JCqSycRk4k8BA/ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf`
- Document intake metadata:
  - `submissionId`: 67b532e2-ea21-430b-b2cc-c38176689e77
  - Classification: `supplier_invoice`, status `ready`
  - `documentId`: e84376b0-55cf-47cc-8c04-68075f95a3e3
- Implied requested service: Bookkeeping document ingestion and field extraction for Eingangsrechnung (supplier invoice).

## 3. Period / Dates
- Financial year: 01.01.–31.12.2026 (from DATEV footer)
- Leistungszeitraum (service period): Mai 2026
- Original invoice data (from document):
  - Supplier: Büro & Mehr GmbH, Kufsteiner Str. 45, 83022 Rosenheim
  - Original invoice number: BM-2026-8834
  - Original invoice date: 16.05.2026
  - Eingangsdatum (receipt by mandant): 19.05.2026
  - Interne Belegnr.: ER-2026-0031

## 4. Normalized Document Summary (factual only)
- Document nature: Internally prepared Eingangsrechnung summary sheet by Berg-und-Tal-Eventtechnik GmbH based on supplier invoice from Büro & Mehr GmbH; original supplier invoice is stated to be on file at the Kanzlei.
- Line items (no tax classification beyond what is on the document):
  1. Druckerpapier A4, 80 g/m², blanko weiß – 5 Ries à 8,40 EUR, netto 42,00 EUR
  2. Aktenordner A4 breit, 80 mm Rückenbreite, schwarz – 10 Stück à 4,50 EUR, netto 45,00 EUR
  3. Druckerpatronen-Set (1× schwarz, 3× Farbe) – 1 Set à 36,90 EUR, netto 36,90 EUR
  4. Büro- und Schreibmaterial sortiert (Permanent-Marker, Heftklammern, Locher, Klebestreifen) – 1 Sortim. à 24,10 EUR, netto 24,10 EUR
- Totals (as shown on document):
  - Nettobetrag: 148,00 EUR
  - zzgl. 19 % MwSt.: 28,12 EUR
  - Gesamtbetrag: 176,12 EUR
- Mandant footer information:
  - Hinweis that this document is a prepared booking sheet; original invoice is separately filed.
  - DATEV booking suggestion (SKR03) is present but treated as existing metadata, not re-evaluated.

## 5. Received Documents
- `ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf` (1 page), classified as supplier invoice, status `ready` in intake metadata.
- Original supplier invoice from Büro & Mehr GmbH is referenced as “separat abgelegt” at Kanzlei; not attached to this ticket.

## 6. Missing Items / Open Questions
- No immediate blocking items for Document Ingestion:
  - Mandant identity, supplier, period, and invoice metadata are all clearly present on the prepared Eingangsbeleg.
  - Intake metadata already provides `submissionId`, `documentId`, and `sourceLink` for the Telegram file.
- Non-blocking note:
  - If downstream processing requires the original supplier PDF (rather than the prepared Eingangsbeleg), it would need to be retrieved from the Kanzlei’s document system using the references: supplier Büro & Mehr GmbH, invoice no. BM-2026-8834, date 16.05.2026, interner Beleg ER-2026-0031.

## 7. Handoff Recommendation
- Next owner: **Document Ingestion Agent** (bookkeeping field extraction for supplier invoice).
- Handoff is ready; all mandatory intake fields for this Telegram supplier invoice are present.

### Handoff Payload for Document Ingestion
Use the following values for the downstream workflow run (bookkeeping:extract_fields):
- `submissionId`: `67b532e2-ea21-430b-b2cc-c38176689e77`
- `documentId`: `e84376b0-55cf-47cc-8c04-68075f95a3e3`
- `fileName`: `ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf`
- `sourceLink`: `/home/ubuntu/.paperclip/instances/default/projects/9e9efaf5-c2d9-4372-99a4-1b8b666a49cb/c50b2b6d-7422-408d-805f-bf2c4407a319/_default/showcase/runtime/telegram-files/BQACAgIAAxkBAANNajOp2Pc-svSRb3wBS_9PhAfzzLIAAjKTAALGnplJ-JCqSycRk4k8BA/ER-2026-0031_Eingangsrechnung_Buero-Mehr.pdf`
- `route`: `bookkeeping:extract_fields`
- Suggested downstream owner: Document Ingestion Agent

