---
source: src/modules/invoicing/services/credit-breakdown.ts
source_sha256: e759257db249308046342efdfb1fffcf7dfbcb9f44e1e681473a584b89e350d1
context_sha256: 79a3c58f357b8c06ec2127562afe7651dafde766e7edfdadb1f0a70d809414b4
generated_at: 2026-11-22T05:34:39.499995+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/credit-breakdown.ts

## Purpose
Computes the VAT figures for a partial credit note. It is the single place where the split credit lines meet the tax function from the `orders` module. It lives in `services/` rather than `src/modules/invoicing/domain/credit-shares.ts` because the tax extraction is `orders`' rule, and a domain folder may not import from a sibling module.

## Key elements
- `creditBreakdownOf(lines, currency)` is the only export.
  - `lines` is a readonly `CreditLine[]`, the shares that `creditShares` produced.
  - `currency` is the invoice's currency.
  - It returns an `OrderTaxBreakdown`.
  - It converts the lines with `asTaxItems`, then passes them to `orderTaxBreakdown`. VAT is extracted from each share the same way the original invoice did, so the figures reconcile exactly.

## Relationships
- **`orders` (`src/modules/orders/index.ts`, `src/modules/orders/domain/tax.ts`)**: imports `orderTaxBreakdown` and the `OrderTaxBreakdown` type through the module's public entry point. The tax rules themselves are defined on the `orders` side.
- **`invoicing/domain` (`src/modules/invoicing/domain/index.ts`, `src/modules/invoicing/domain/credit-shares.ts`, `src/modules/invoicing/domain/tax-items.ts`)**: imports `asTaxItems` and the `CreditLine` type from the domain barrel. `CreditLine` and the shares come from `credit-shares.ts`, and `asTaxItems` comes from `tax-items.ts`.
- **Tests**: `src/modules/invoicing/tests/unit/credit-breakdown.test.ts` is the unit test for this file.
- **Other neighbors**: `src/modules/invoicing/services/figures.ts` and `src/modules/delivery/tests/unit/fulfillment.test.ts` appear in the dependency graph. The file's content shows no direct interaction with either.

## Notes
- Every line is forced to `requiresShipping: false` and `shippingCost` is `undefined`. Delivery is already folded into the rate rows, so the breakdown has no shipping of its own. This stops delivery from being counted twice.
- The file's header comment points to the `issuing-a-document` section of the invoicing module documentation.
