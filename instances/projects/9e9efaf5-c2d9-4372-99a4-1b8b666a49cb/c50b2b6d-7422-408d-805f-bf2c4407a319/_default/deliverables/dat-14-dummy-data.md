# DAT-14 Dummy Data

## Client Master Data

| Field | Value |
| --- | --- |
| Legal entity | Berg & Tal Eventtechnik GmbH |
| Industry | Event equipment rental |
| VAT ID | DE342198765 |
| Fiscal contact | Lisa Berg, Managing Director |
| Kanzlei contact | Maria Schneider, Steuerfachangestellte |
| Accounting basis | Standard monthly bookkeeping with DATEV export |
| Bank | Sparkasse KoelnBonn business account |

## Monthly Input Bundle

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

## Representative Transactions

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

## Extracted Accounting Totals

| Metric | Amount EUR |
| --- | ---: |
| Revenue gross | 18,742.00 |
| Revenue net | 15,749.58 |
| Output VAT | 2,992.42 |
| Operating expenses gross | 4,382.65 |
| Operating expenses net | 3,689.62 |
| Input VAT | 693.03 |
| Net VAT payable | 2,299.39 |

## Intended Exception

The Metro invoice includes drinks and snacks for an internal team celebration after a large event. The system extracts the line items correctly but flags the posting because the expense could be non-deductible hospitality or partially private consumption.

- Source document: `beleg-2026-04-metro.pdf`
- Amount: 119.84 EUR gross
- Risk: uncertain deductibility and VAT recovery
- Suggested action: hold booking in "needs review" and ask the case handler whether it should be split or treated as non-deductible
