# First Showcase: Steuerkanzlei Intake to Monthly Closing Package

## Purpose

This showcase demonstrates one narrow but credible Steuerkanzlei workflow for a German tax office serving a small GmbH client. The scenario shows how an agentic workflow reduces manual bookkeeping prep, catches a VAT anomaly, and produces a review-ready monthly package.

## Showcase Summary

- Client: Berg & Tal Eventtechnik GmbH, Cologne
- Kanzlei: Kanzlei Nordstern Steuerberatung
- Accounting period: April 2026
- Core promise: convert a messy monthly document drop into a review-ready bookkeeping package with one flagged exception

## Dummy Data Set

### Client Master Data

| Field | Value |
| --- | --- |
| Legal entity | Berg & Tal Eventtechnik GmbH |
| Industry | Event equipment rental |
| VAT ID | DE342198765 |
| Fiscal contact | Lisa Berg, Managing Director |
| Kanzlei contact | Maria Schneider, Steuerfachangestellte |
| Accounting basis | Standard monthly bookkeeping with DATEV export |
| Bank | Sparkasse KoelnBonn business account |

### Monthly Input Bundle

The client uploads the following files for April 2026:

| File | Type | Notes |
| --- | --- | --- |
| `2026-04-bank.csv` | Bank statement export | 41 transactions |
| `eingang-rechnungen-april.zip` | Supplier invoices | 12 PDF invoices |
| `ausgangsrechnungen-april.zip` | Customer invoices | 7 PDF invoices |
| `beleg-2026-04-amazon.pdf` | Supplier invoice | Office and cable supplies |
| `beleg-2026-04-metro.pdf` | Supplier invoice | Drinks/snacks for staff event |
| `beleg-2026-04-telekom.pdf` | Supplier invoice | Internet and mobile |
| `beleg-2026-04-van-rental.pdf` | Supplier invoice | Vehicle rental for event delivery |
| `sales-summary-april.xlsx` | Internal summary | Used as soft cross-check only |

### Representative Transactions

| Date | Counterparty | Gross EUR | Expected treatment | Matching document |
| --- | --- | ---: | --- | --- |
| 2026-04-02 | Stadtwerke Koeln | 428.40 | Utilities expense, input VAT 19% | supplier invoice |
| 2026-04-03 | Eventhaus Bonn GmbH | 4,165.00 | Customer payment, output VAT 19% | outgoing invoice RE-24041 |
| 2026-04-05 | Amazon EU S.a r.l. | 238.91 | Office supplies, input VAT 19% | `beleg-2026-04-amazon.pdf` |
| 2026-04-08 | Telekom Deutschland GmbH | 154.70 | Telecom expense, input VAT 19% | `beleg-2026-04-telekom.pdf` |
| 2026-04-12 | Metro Deutschland GmbH | 119.84 | Mixed expense, requires review | `beleg-2026-04-metro.pdf` |
| 2026-04-14 | Hochzeit Mayer GbR | 2,975.00 | Customer payment, output VAT 19% | outgoing invoice RE-24044 |
| 2026-04-18 | Van4Event GmbH | 892.50 | Vehicle rental, input VAT 19% | `beleg-2026-04-van-rental.pdf` |
| 2026-04-24 | Berg & Tal Eventtechnik GmbH | 1,500.00 | Owner cash injection, no VAT | none |
| 2026-04-28 | Messebau Rhein AG | 5,950.00 | Customer payment, output VAT 19% | outgoing invoice RE-24047 |

### Extracted Accounting Totals

| Metric | Amount EUR |
| --- | ---: |
| Revenue gross | 18,742.00 |
| Revenue net | 15,749.58 |
| Output VAT | 2,992.42 |
| Operating expenses gross | 4,382.65 |
| Operating expenses net | 3,689.62 |
| Input VAT | 693.03 |
| Net VAT payable | 2,299.39 |

### Intended Exception

The Metro invoice includes drinks and snacks for an internal team celebration after a large event. The system extracts the line items correctly but flags the posting because the expense could be non-deductible hospitality or partially private consumption. The showcase uses this as the single human-review moment.

Flag details:

- Source document: `beleg-2026-04-metro.pdf`
- Amount: 119.84 EUR gross
- Risk: uncertain deductibility and VAT recovery
- Suggested action: hold booking in "needs review" and ask the case handler whether it should be split or treated as non-deductible

## End-to-End Showcase Narrative

### Scenario

Kanzlei Nordstern receives the April bookkeeping package from Berg & Tal Eventtechnik GmbH. Instead of manually sorting PDFs, matching bank lines, and calculating VAT, the workflow ingests the bundle, extracts the data, proposes bookings, and leaves the clerk with one concise exception to resolve.

### User Journey

1. The presenter starts with the incoming client delivery: a bank export plus mixed invoice files for April 2026.
2. The system groups files by source, identifies supplier and customer documents, and shows coverage against bank transactions.
3. The presenter opens the extraction screen and highlights three examples:
   - a normal supplier invoice with clean VAT extraction
   - a customer invoice matched to an incoming payment
   - the Metro invoice that is extracted but flagged for review
4. The system produces a booking proposal list with confidence markers and one visible exception.
5. The presenter switches to the monthly summary showing revenue, expenses, and VAT payable.
6. The walkthrough ends with the review-ready package: posting proposals, DATEV-ready export, and a short follow-up note asking the clerk to classify the Metro expense.

## Recommended Presentation Flow

### Screen 1: Client intake overview

Show:

- client name and accounting month
- uploaded files with counts by category
- progress indicator: "41 bank lines, 19 invoices, 18 matched automatically, 1 needs review"

Talking point:

- The value starts before bookkeeping: the office immediately sees whether the monthly packet is complete enough to process.

### Screen 2: Document extraction detail

Show:

- parsed invoice fields for Amazon, Telekom, and Metro
- supplier, date, net, VAT, gross, and suggested account
- confidence badge per document

Talking point:

- This removes repetitive transfer work from PDF to bookkeeping system while keeping source visibility for audit comfort.

### Screen 3: Exception review

Show:

- the Metro invoice
- the reason for the flag
- the proposed next action for the clerk

Talking point:

- The showcase should prove that automation does not hide uncertainty; it isolates the one item where tax judgment still matters.

### Screen 4: Monthly closing package

Show:

- proposed bookings summary
- VAT payable for the month
- export-ready state for DATEV
- short clerk task list with one open decision

Talking point:

- The clerk is no longer assembling data. The clerk is reviewing a prepared monthly package with attention focused on exceptions.

## Why This Scenario Proves Value

- It is narrow: one client, one month, one exception.
- It is credible: every Steuerkanzlei handles monthly document drops, bank matching, and VAT checks.
- It demonstrates both automation and control: most work is automated, but the process still surfaces a real tax-sensitive review point.
- It ends in an operational artifact: a review-ready booking package rather than a generic AI summary.

## Board Review Notes

- Keep the demo under five minutes.
- Do not add extra features such as chat, dashboards, or forecasting to the first showcase.
- The success criterion is simple: viewers should understand that the workflow turns raw client uploads into a nearly finished monthly bookkeeping package with only one human decision left.
