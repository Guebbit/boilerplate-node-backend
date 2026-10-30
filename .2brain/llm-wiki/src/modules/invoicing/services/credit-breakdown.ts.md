---
source: src/modules/invoicing/services/credit-breakdown.ts
sha256: 113ff892d61a54a4508570fcfa5f149119dd8209dc4800277aca8e95144cdd26
generated_at: 2026-10-29T04:13:45.814243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/credit-breakdown.ts

## Purpose

Extracts the VAT figures for a partial credit note by running its credit-share lines through the `orders` tax function. It is the single seam where credit-share data meets tax calculation, and it exists as a separate service file (rather than living in `domain/`) because it must import from the `orders` module—a boundary the `invoicing/domain` folder is not allowed to cross.

## Key elements

- **`creditBreakdownOf(lines, currency)`** — the only export. Accepts the `CreditLine[]` produced by `creditShares` plus the invoice currency, maps each line into a tax item (forcing `requiresShipping: false`), and delegates to `orderTaxBreakdown` with `shippingCost: undefined`. Returns an `OrderTaxBreakdown`.

## Relationships

- **`src/modules/invoicing/domain/index.ts`** — imports `asTaxItems` and the `CreditLine` type from this barrel.
- **`src/modules/invoicing/domain/credit-shares.ts`** — produces the `CreditLine` values that feed into `creditBreakdownOf`; this file is kept outside that module to avoid a domain→sibling-module import.
- **`src/modules/invoicing/domain/tax-items.ts`** — defines `asTaxItems`, the adapter that shapes credit lines into the tax-item structure.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/domain/tax.ts`** — source of `orderTaxBreakdown` and the `OrderTaxBreakdown` type, the actual tax computation this file wraps.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — the service that consumes `creditBreakdownOf` when assembling a credit note.
- **`src/modules/invoicing/tests/unit/credit-breakdown.test.ts`** — unit tests for this module.

## Notes

- `requiresShipping` is hard-coded to `false` and `shippingCost` to `undefined` because delivery costs are already folded into the per-rate rows of the credit shares; no line in a credit note ships independently.
- The module docblock links to `docs/modules/invoicing.md#issuing-a-document` for broader context.
