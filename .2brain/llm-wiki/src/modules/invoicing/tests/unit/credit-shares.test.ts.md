---
source: src/modules/invoicing/tests/unit/credit-shares.test.ts
sha256: f132c4c9e24134b6935e167fe7f4a4a9fca82f8efa0a445e232e367b6a7740b4
generated_at: 2026-11-08T06:18:41.763556+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/credit-shares.test.ts

## Purpose

Unit tests for the pure-arithmetic `creditShares` function: spreading a refunded amount across an invoice's VAT rates in proportion to what each rate collected. By testing the function in isolation (no database, no real tax service), these tests pin the distribution math; companion integration tests cover the function through the full refund flow.

## Key elements

- **`describe('creditShares')`** — Core distribution tests:
  - Proportional split by gross weight (e.g. 23.20 → 11.00 @ 10% + 12.20 @ 22%).
  - Output lines never carry a tax rate the invoice didn't charge.
  - A rate whose share rounds to 0 is omitted entirely.
  - The leftover "odd cent" is allocated to the heaviest (highest) tax rate.

- **`describe('creditShares — a refund for specific goods')`** — Targeted-refund tests using a mixed invoice (book @ 10%, lamp @ 22%, split delivery):
  - A returned product is credited only at its own rate.
  - Full-invoice refund (goods + delivery) splits back across all rates at the original weights.
  - A deduction smaller than the returned goods (e.g. 55.00 of a 61.00 lamp) stays at that product's rate.
  - If the returned `productId` isn't on the invoice, the function falls back to spreading across every rate.

- **Fixture objects** — Inline `CreditableInvoice` literals (`invoice`, `mixed`) with `currency`, `lines`, `shippingByRate`, and `taxSummary` fields; no shared factory.

## Relationships

- **`src/modules/invoicing/domain/credit-shares.ts`** — Source of the `creditShares` function and the `CreditableInvoice` type under test.
- **`src/modules/invoicing/domain/index.ts`** — Barrel re-export; the test imports via `../../domain`, resolving through this index.

## Notes

- All monetary values are **strings** (e.g. `'12.20'`), not numbers — tests assert string equality.
- The odd-cent convention is explicit: always goes to the **highest** tax rate, not the first or largest-weight one.
- The header comment cross-references `credit-breakdown.test.ts` (total reconciliation) and `issue-credit-note.test.ts` (integration through the real refund path); neither is imported here.
- Product IDs in the "specific goods" suite are arbitrary hex strings; one test intentionally uses an ID not present on the invoice to exercise the fallback path.
