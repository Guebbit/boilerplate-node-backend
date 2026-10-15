---
source: src/modules/invoicing/tests/unit/emails.test.ts
sha256: 09afb90d9bc9bc52d6b7d5c3fd156263661a20817a35b3f99a353e146f3532a4
generated_at: 2026-10-15T10:40:42.766100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/emails.test.ts

## Purpose
Unit tests for `buildDocumentView` and `taxCategoryCode` in the invoicing email module. Verifies that rendered invoice/credit-note documents have correct line items, VAT tables, currency formatting, locale-aware labels, EN 16931 tax-category codes, and structural guards (no float re-multiplication, no i18n leakage into user-supplied titles).

## Key elements
- **`DOCUMENT`** (fixture) — single-line, single-rate EUR invoice with frozen totals; the baseline for most `buildDocumentView` assertions.
- **`MIXED`** (fixture) — two-line, two-rate document with per-rate shipping; used for unit-price-excl.-VAT and per-rate VAT-share tests.
- **`describe('buildDocumentView')`** — row count/titles, document number in `pageMetaTitle`, locale propagation, title-collision safety (line titles never run through `t()`), invoice vs. credit-note titling, reversal notice, optional billing address block.
- **`describe('buildDocumentView — the VAT block')`** — gross re-derived from frozen `unitPrice × quantity` (guards IEEE 754 drift), all amounts are `Intl.NumberFormat` strings, shipping table present/absent per `shippingByRate`, currency-aware symbols (EUR → €, GBP → £), VAT-number line or "not configured" fallback.
- **`describe('taxCategoryCode — EN 16931 category, C4')`** — `S` for any non-zero rate, `Z` for 0 % with no/explicit-zero `rateType`, `E` for 0 % marked `exempt`.
- **`describe('…category column, C4')`** — distinct `Z` and `E` codes on separate rows; column header translated per document locale.
- **`describe('…net unit price and once-per-rate VAT, worked example')`** — unit price printed VAT-exclusive (Art. 226(8)) to 4 decimal places, column labelled "Unit price (excl. VAT)", per-line tax shares sum to frozen per-rate goods VAT, JPY (no minor unit) renders whole-yen prices.

## Relationships
- **`src/modules/invoicing/emails.ts`** — source of `buildDocumentView` (the renderer under test) and `taxCategoryCode` (EN 16931 C4 mapper). All assertions target their returned shapes.
- **`src/modules/invoicing/providers/index.ts`** — source of the `EInvoicingDocument` type that shapes both fixtures and the expected document structure.

## Notes
- The module comment states this suite was **adapted from the retired `invoiceDocument` tests in `orders/tests/unit/emails.test.ts`**; look there for historical context if behavior seems inherited.
- Fixtures store **frozen** monetary totals (never recomputed from rates). Tests explicitly assert that `buildDocumentView` does *not* re-multiply — e.g. 19.99 × 5 must render as `€99.95`, not `€99.9499…`.
- Line `title` values are user-supplied strings and must **never** be passed through the i18n `t()` function; the "colliding title" test (`'invoicing.document.title'`) guards against a regression where a translation key overwrites the visible text.
- Unit-price rendering is VAT-exclusive and may carry **up to 4 decimal places** beyond the minor unit (e.g. `€16.3115`); whole-yen (JPY) prices must omit the fractional part.
- `taxCategoryCode` ignores `rateType` when the rate is non-zero (always `S`); the distinction between `Z` and `E` only applies at 0 %.
