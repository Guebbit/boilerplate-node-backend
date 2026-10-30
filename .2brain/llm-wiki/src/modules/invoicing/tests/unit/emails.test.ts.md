---
source: src/modules/invoicing/tests/unit/emails.test.ts
sha256: 1bbdc32270601ab7c09a33be65aa9281e87c8ef11bb2bef72f4131b6d70793a0
generated_at: 2026-10-29T04:18:35.603006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/emails.test.ts

## Purpose

Unit tests for `buildDocumentView` and `taxCategoryCode` from the invoicing email module. They verify that the rendered document view — the thing a customer actually reads — produces correct line items, VAT arithmetic, i18n strings, and regulatory labels (EN 16931 category codes, Art. 226(8) net unit prices) without re-deriving values that were already frozen at order time.

## Key elements

- **`DOCUMENT` fixture** — a single-line, single-rate (22 % EUR) invoice used as the baseline for most assertions.
- **`MIXED` fixture** — two lines at two rates plus shipping, used for the net-unit-price and per-rate VAT-allocation tests.
- **`describe('buildDocumentView', …)`** — row-per-item rendering, document-number in `pageMetaTitle`, locale propagation, title-collision guard (line titles must not be passed through `t()`), invoice vs. credit-note `title`, `reversalNotice` only on credit notes, optional `billing` block, `buyerErasedNotice`.
- **`describe('…VAT block', …)`** — gross/net/tax must come from frozen values (no float re-multiply), all amounts are `Intl.NumberFormat` strings, `shipping` sub-table present only when `shippingByRate` is non-empty, currency respects the document's frozen code, supplier VAT-number line or "not configured" fallback.
- **`describe('taxCategoryCode', …)`** — pure-function checks: non-zero rate → `S`, 0 % no-type or `zero-rated` → `Z`, 0 % `exempt` → `E`.
- **`describe('…category column', …)`** — `Z` and `E` must appear as distinct codes on separate rows; column header is locale-translated.
- **`describe('…net unit price and once-per-rate VAT', …)`** — unit price printed exclusive of VAT with 4-decimal precision, column labelled "Unit price (excl. VAT)", per-line tax share sums to the frozen goods-VAT total for that rate.

## Relationships

- **`src/modules/invoicing/emails.ts`** — the module under test; provides `buildDocumentView` (the view renderer) and `taxCategoryCode` (EN 16931 C4 code resolver).
- **`src/modules/invoicing/providers/index.ts`** — supplies the `EInvoicingDocument` type that shapes every fixture in this file.

## Notes

- The comment block at the top credits an earlier `orders/tests/unit/emails.test.ts` suite; this file is a port, not a fresh test.
- The 19.99 × 5 case is deliberately chosen because IEEE-754 multiplication yields `99.94999999999999`; the test asserts the frozen `99.95` survives, guarding against a "convenient" re-multiply in the renderer.
- The title-collision test (`'invoicing.document.title'` as a line title) is a regression guard: line titles are user data and must never be resolved through the i18n `t()` helper.
- `MIXED`'s worked-example numbers are cross-referenced to `orders/tests/unit/tax.test.ts` for the tax-split arithmetic.
