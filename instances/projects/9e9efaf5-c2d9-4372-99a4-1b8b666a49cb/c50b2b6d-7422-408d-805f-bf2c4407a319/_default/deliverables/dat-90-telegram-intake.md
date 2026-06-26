# DAT-90 Telegram Mandant Intake – 20260615_Anschreiben_Eingangsbelege_Mai2026.pdf

## Summary
- **Mandant**: Berg & Tal Eventtechnik GmbH (mandant number 58734, standard monthly DATEV bookkeeping).
- **Channel**: Mandant Telegram bot (@Mandat_Paper_bot) – this intake is the handwritten cover letter that describes the May 2026 packet of Eingangsbelege.
- **Document**: 2-page Anschreiben dated 15.06.2026, signed by Markus Bergmann (Sachbearbeiter/Geschäftsführer), addressed to DATEV Lab Kanzlei.
- **Current status**: Document Ingestion now has the PDF and distilled field data ready for Bookkeeping Reconciliation; this artifact is supporting correspondence (not a receipt itself) and points at the actual receipts already opened as DAT-85 (ProAudio Nord invoice) and DAT-87 (Kassenbeleg_20260512).

## Extracted metadata
- **Mandantennummer**: 58734 (Berg-und-Tal-Eventtechnik GmbH).
- **Sachbearbeiter**: Markus Bergmann (Geschäftsführer).
- **Subject**: Übersendung von Eingangsbelegen – Buchungsmonat Mai 2026.
- **Booking period**: Mai 2026 (2026-05).
- **Letter claims**: every attached Beleg already contains DATEV SKR03 booking proposals; the packet is ready for posting once the referenced receipts are processed.

## Referenced receipts
| Nr. | Belegtyp | Dateiname | Lieferant | Betrag brutto | VAT note |
| --- | --- | --- | --- | --- | --- |
| 1 | Eingangsrechnung | ER-2026-0031_Eingangsrechnung_ProAudioNord.pdf | ProAudio Nord GmbH (USt-IdNr. DE198754321) | 2.856,00 EUR | 19 % Vorsteuer nach § 15 Abs. 1 UStG – fully deductible |
| 2 | Kassenbeleg | Kassenbeleg_20260512.pdf | Büro & Mehr GmbH | 47,60 EUR | Bürobedarf; Vorsteuerabzug gem. § 15 Abs. 1 UStG |

## Totals in this packet
- **Gesamtbetrag brutto**: 2.903,60 EUR
- **davon Vorsteuer (19 %)**: 463,60 EUR
- **Netto**: 2.440,00 EUR (inferred from gross minus VAT)

## Supporting statements pulled from the letter
1. Datum 15.06.2026; Betreff and recipient address match DATEV Lab Kanzlei.
2. The body explicitly states the attached Eingangsbelege of Berg-und-Tal-Eventtechnik GmbH for Mai 2026 carry full SKR03 booking proposals.
3. ProAudio Nord invoice (ER-2026-0031) and its VAT Id (DE198754321) are mentioned as fully deductible per § 15 Abs. 1 UStG.
4. Kassenbeleg_20260512 is listed as Bürobedarf with § 15 Abs. 1 UStG treatment.
5. The cover letter is signed by Markus Bergmann (Geschäftsführer) and doubles as the Sachbearbeiter note for this telegram submission (message id 51, file id BQACAgIAAxkBAAMzajKLkKMmv6Kd2d6zoy4cUuGPGfEAAoiYAALGnpFJiGoKxPQQkts8BA).

## Downstream bookkeeping context
- **Referenced extraction issues**: DAT-85 (ER-2026-0031_Eingangsrechnung_ProAudioNord.pdf) and DAT-87 (Kassenbeleg_20260512.pdf). Use those artifacts as the primary evidence for the receipts themselves.
- **Purpose**: This document exists solely to tie those receipts together as the May 2026 packet and report the aggregated totals/filing notes (e.g., SKR03 proposals, VAT deduction permissions).
- **Next action for Bookkeeping Reconciliation**:
  1. Verify that the downstream booking issue incorporates the totals (gross 2.903,60 EUR, VAT 463,60 EUR, SKR03 posting proposals) for Mai 2026.
  2. Cross-link/attach this cover letter so the monthly packet evidences are traceable.
  3. Once the receipts from DAT-85 and DAT-87 are posted, close DAT-90; the cover letter itself is supporting correspondence and does not need a standalone booking.

## Artifact paths
- Covered PDF: `deliverables/dat-90-20260615-anschreiben-eingangsbelege-mai2026-source.pdf` (sha256 `595d702510ae3fb74f90da47d3de62c113f3d4eed3e015fc7be5f0be8c3ff69a`).
- Runtime sourceLink: `/showcase/runtime/telegram-files/BQACAgIAAxkBAAMzajKLkKMmv6Kd2d6zoy4cUuGPGfEAAoiYAALGnpFJiGoKxPQQkts8BA/20260615_Anschreiben_Eingangsbelege_Mai2026.pdf`
