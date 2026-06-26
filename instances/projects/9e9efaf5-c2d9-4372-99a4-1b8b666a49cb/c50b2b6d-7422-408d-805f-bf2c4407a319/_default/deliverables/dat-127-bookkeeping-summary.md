# Bookkeeping Handoff: DAT-127 / DAT-144

- **Document:** Credit note GS-2026-0005 (19.05.2026) referencing RE-2026-0023 for Hotel Alpenpanorama GmbH & Co. KG (KD-00182).
- **Source file:** `showcase/runtime/telegram-files/BQACAgIAAxkBAANDajKyqaZRQ0BlZ0zUK_l7BI1juz8AApiaAALGnpFJIAaHNHIAAaR7PAQ/GS-2026-0005_Gutschrift.pdf` (SHA256 `6f199795fd186f4607d91e17399172c2257ac2c1a15981c6ff642a34fbae993c`).
- **Extraction JSON:** `deliverables/dat-127-telegram-intake-GS-2026-0005-extraction.json` (status `ready_for_downstream_handoff`).
- **Mandant:** Berg & Tal Eventtechnik GmbH (Mandantennr. 58734, SKR03 monthly bookkeeping).

- **Amounts:**
  - Nettobetrag 550,00 EUR
  - Umsatzsteuer 19 % → 104,50 EUR
  - Gesamtbetrag 654,50 EUR
  - Zeile: Teilgutschrift Lichtanlage am 11.05.2026 (LED-Moving-Head, Par-Scheinwerfer, DMX-Controller).

- **DATEV-Buchungsvorschlag (SKR03):**
  1. Soll 8400 (Erlöse 19 %): 550,00 EUR
  2. Soll 1776 (Umsatzsteuer 19 %): 104,50 EUR
  3. Haben 10182 (Debitor Hotel Alpenpanorama): 654,50 EUR

- **Next actions for Bookkeeping Reconciliation:**
  1. Post the credit that reverses RE-2026-0023 (KD-00182) in the May 2026 posting batch, reducing Erlöse and Umsatzsteuer while crediting the customer account.
  2. Confirm that the adjusted Debitorensaldo 10182 now incorporates the 654,50 EUR Gutschrift before closing DAT-127.
  3. Attach or reference this Telegram-derived PDF when documenting the credit, then close this downstream ticket once the balance matches.
