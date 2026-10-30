---
source: src/modules/invoicing/tests/unit/credit-shares.test.ts
sha256: 54df47ef4f89f22c90bb6885c37fd01fad62d087e6d8ecba55e2496fd31bc6b3
generated_at: 2026-10-29T04:18:24.521272+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/tests/unit/credit-shares.test.ts

## Purpose

Unit tests for `creditShares`, the pure function that spreads a refunded amount across an invoice's VAT rates proportionally to gross weight. Pinned here without a database or the tax function so the arithmetic (rounding, rate assignment, line-item filtering) is verified in isolation; higher-level integration tests cover the full refund flow.

## Key elements

- **`describe('creditShares')`** — Core spreading logic:
  - Proportional split by gross amount across rates.
  - Output lines never carry a rate the invoice didn't charge.
  - A rate whose proportional share rounds to 0 is omitted entirely.
  - The "odd cent" (rounding remainder) is assigned to the heaviest (highest-gross) rate.
- **`describe('creditShares — a refund for specific goods')`** — The `options` parameter (returned line-items + shipping):
  - A refunded book credits only at the book's rate, not the lamp's.
  - Full refund of goods + delivery credits at the exact per-rate gross the invoice charged.
  - A partial refund (deduction smaller than the goods) is split only across the rates of the returned items.
  - If the returned `productId` matches no invoice line, the function falls back to spreading across every rate on the invoice.
- **`invoice` / `mixed` fixtures** — Local `CreditableInvoice` objects (EUR, 10 % and 22 % rates) used as inputs; `mixed` additionally carries `lines` and `shippingByRate` to exercise the line-item path.

## Relationships

- **`src/modules/invoicing/domain/index.ts`** — Barrel file from which this test imports `creditShares` and the `CreditableInvoice` type via `../../domain`.
- **`src/modules/invoicing/domain/credit-shares.ts`** — The module under test; defines the `creditShares` function and the `CreditableInvoice` interface exercised by every assertion here.

## Notes

- The test file deliberately avoids the tax function and any persistence layer — it treats `creditShares` as a pure `(invoice, amount, title, options?) → lines` mapping.
- The "odd cent goes to the heaviest rate" rule is the non-trivial rounding convention; the `mixed` fixture (18.25 / 44.05) is chosen specifically to produce a 1-cent remainder so this path is exercised.
- The "falls back to every rate" test uses a `productId` that is intentionally absent from the fixture's `lines` array, confirming the fallback rather than an error.
