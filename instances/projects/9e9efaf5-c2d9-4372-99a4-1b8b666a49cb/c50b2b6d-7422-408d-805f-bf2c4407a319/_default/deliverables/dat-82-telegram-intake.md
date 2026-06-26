# DAT-82 Telegram Mandant Intake – 20260615_Anschreiben_Eingangsbelege_Mai2026.pdf

## Structured case brief (intake normalization)

- **Client / Mandant**: berg-und-tal-eventtechnik-gmbh
- **Contact / Sender**: Moritz (Telegram sender; full legal role not specified)
- **Channel**: Mandant Telegram bot (`@Mandat_Paper_bot`), internal intake path
- **Entity type**: GmbH (implied by name; treat as corporate entity, not natural person)
- **Period / Scope**: Eingangsbelege (vendor/expense-side documents) for **May 2026**
- **Ticket / Intake ID**: DAT-82 (Paperclip issue)
- **Telegram identifiers**:
  - `telegram_chat_id`: 8695197922
  - `telegram_message_id`: 48
- **Document intake IDs**:
  - `submissionId`: d176d6aa-723a-4650-a8f0-b43fefb4254d
  - `documentId` (internal processing): 21a470c5-63b7-42dd-a1ff-8496f3bee702

### Requested service / intent

- **Intake intent**: `mandant_default` via Telegram Mandant channel
- **Derived service request**: Provide Eingangsbelege for the month **05/2026** for further accounting and tax processing.
- **Downstream path**: `internal_intake` (no Kanzlei-side routing override present).

From the file name `Anschreiben_Eingangsbelege_Mai2026.pdf` and the classification `receipt, ready`, we infer that this is a **cover letter** or transmittal for a package of incoming receipts/invoices relating to May 2026. The actual underlying booking documents may be part of the same Telegram submission batch or sent separately.

### Received documents (this ticket)

- **Primary document**: `20260615_Anschreiben_Eingangsbelege_Mai2026.pdf`
  - **Type / classification**: `receipt` (per document intake pipeline), but semantically likely a **cover letter summarizing incoming receipts** for May 2026.
  - **Status in intake pipeline**: `ready` (extraction completed and available for downstream ingestion).
  - **Telegram file reference**: `BQACAgIAAxkBAAMwai-164cqHDkqk3x8_GcpsPh7pS8AAqOcAAKkCoBJGC7ZJ7G90XI8BA`.

No additional PDF or image attachments are listed on this issue beyond the Anschreiben itself. There is also **no free-text message body** from the Mandant in this intake event.

### Known extractions / structured data

- The webhook description confirms successful intake classification: `receipt, ready` and a concrete internal `documentId`.
- However, **no detailed field-level extraction** (amounts, dates, suppliers, etc.) is exposed in this issue’s description or as an attached JSON document yet.
- There is **no explicit statement** about which individual receipts/invoices are included with this Anschreiben, nor how they were delivered (same Telegram chat, email, or physical handover).

### Completeness assessment (can downstream work start?)

From a Mandant Intake perspective:

- **Identity**: Mandant and sender are clear enough for routing.
- **Channel and intent**: Clear – standard Mandant Telegram intake, internal_intake path.
- **Period**: May 2026 is clearly indicated in the document name and description context.
- **Service type**: Submission of Eingangsbelege (incoming receipts/invoices) for the period – standard Buchhaltungsbelege intake.

However, for **Document Ingestion** and **Buchhaltung** to proceed efficiently, the following are currently ambiguous or missing:

1. **Underlying receipt/invoice documents**
   - The issue only references the Anschreiben PDF. It is unclear whether:
     - the individual Eingangsbelege were also sent via Telegram and already captured under the same `submissionId`, or
     - the cover letter refers to documents delivered via another channel (email, portal upload, physical folder).
   - Without clarity and links to the actual receipt documents, Document Ingestion cannot reliably tie this Anschreiben to a complete document set.

2. **Period boundaries and coverage statement**
   - We know the heading is "Eingangsbelege Mai 2026", but we do not yet know whether this is:
     - the **complete** set of incoming documents for May 2026, or
     - a **partial** delivery (e.g. "first batch", "missing a few receipts").
   - That distinction is important for closing the month, VAT returns, and reminding the Mandant about any missing invoices.

3. **Document ingestion linkage**
   - This issue has no attached extraction JSON or source PDF in the `deliverables/` folder yet.
   - A downstream Document Ingestion Agent will need either:
     - the source PDF placed in the shared workspace and linked, and/or
     - confirmation that it already lives in the Telegram document store and is discoverable via `submissionId` and `documentId`.

Given these gaps, **a downstream tax preparer or bookkeeper should not yet assume that May 2026 Eingangsbelege are complete**. We should first:

- ensure the Anschreiben source PDF and its extraction are available to Document Ingestion, and
- clarify with the Mandant whether all May 2026 incoming documents have been submitted and by which channels.

## Missing items and unblock questions

These unblock questions are phrased to be sent Mandant-facing by the Client Communication Agent.

### Missing items

- Confirmation of whether **all** May 2026 Eingangsbelege have been submitted, or whether further documents will follow.
- If additional documents exist:
  - information on **which channel(s)** they were or will be delivered through (Telegram, email, portal, physical drop-off).
- If receipts were sent separately from the Anschreiben via Telegram:
  - linkage or identifiers to match those individual receipts to this "Mai 2026" packet (e.g. same day, same chat, approximate time, or a note like "gehören zum Anschreiben Mai 2026").

### Mandant-facing unblock questions (for Client Communication Agent)

To be adapted and sent by the Client Communication Agent, not directly by this intake agent:

1. "Bitte bestätigen Sie kurz: Sind mit dem Anschreiben `Eingangsbelege Mai 2026` bereits **alle** Eingangsrechnungen und Belege für Mai 2026 vollständig übermittelt, oder folgen noch weitere Belege?"
2. "Falls noch Belege fehlen oder separat übermittelt wurden: Über welche Kanäle (Telegram, E‑Mail, Portal, Papierordner) haben bzw. werden Sie diese übermitteln, damit wir alles korrekt zuordnen können?"
3. (optional, if Telegram was used for Einzelbelege) "Wenn Sie Belegfotos/-PDFs zusätzlich per Telegram geschickt haben: Gehören alle Belege mit Datum **Mai 2026** in diesem Chat zu dem Anschreiben `Eingangsbelege Mai 2026`, oder gibt es Belege für andere Zeiträume dazwischen?"

## Handoff plan and next owners

### 1) Document Ingestion Agent – document linkage

**Next owner**: Document Ingestion Agent

**Action**:
- Locate and attach the source PDF and (if available) extraction JSON for:
  - `20260615_Anschreiben_Eingangsbelege_Mai2026.pdf`
  using the known intake identifiers:
  - `submissionId`: d176d6aa-723a-4650-a8f0-b43fefb4254d
  - `documentId`: 21a470c5-63b7-42dd-a1ff-8496f3bee702
- Store the normalized extraction (e.g. in `deliverables/dat-82-...-extraction.json`) and link it back to this issue.
- Confirm whether additional receipt documents for May 2026 are present in the same submission batch and, if so, cross-reference them.

### 2) Client Communication Agent – completeness clarification

**Next owner**: Client Communication Agent

**Action**:
- Use the unblock questions above to contact the Mandant (Moritz / berg-und-tal-eventtechnik-gmbh) over the configured Mandant channel.
- Capture the answers in a short structured update on this issue:
  - `periodComplete: yes/no`
  - `additionalChannelsUsed: [telegram|email|portal|physical]`
  - `expectedFollowupDocumentsDescription` (free text, max 2–3 lines).

### 3) Downstream tax/bookkeeping agents (after clarification)

Once 1) and 2) are complete:

- **Tax Preparation / Buchhaltung** can safely treat this intake as either:
  - a complete set of Eingangsbelege for May 2026 (and proceed to booking and VAT preparation), or
  - a partial delivery with explicit notes about what is missing.

## Intake agent disposition for this heartbeat

From a Mandant Intake perspective, the case brief above is now structured and ready for downstream agents, but execution depends on Document Ingestion and Client Communication.

- **Current status proposal**: keep `DAT-82` as `in_progress` with this brief attached, or mark it `blocked` with named owners if the workflow expects intake to wait for Mandant confirmation before closing.
- For this heartbeat, I will:
  - attach this structured brief as a comment, and
  - recommend marking the next concrete actions and owners explicitly, as summarized above.

